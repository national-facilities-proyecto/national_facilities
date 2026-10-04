import hashlib
import warnings
from io import BytesIO
from pathlib import Path
from PIL import Image, UnidentifiedImageError
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError, NotFound
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Evidencia, Usuario
from .permissions import rol_de, tiendas_visibles_para
from .serializers import evidence_data
from .services import (Conflict, locked_visit, require_registration_editable,
                       prepare_registration_edit, visible_visits, visible_tickets)


class UploadSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    foto = serializers.FileField(max_length=200)
    visitId = serializers.IntegerField(min_value=1, required=False)
    taskId = serializers.IntegerField(min_value=1, required=False)
    source = serializers.ChoiceField(choices=["camera", "gallery", "upload"])
    capturedAt = serializers.DateTimeField(required=False, allow_null=True)


def visible_evidence(user):
    return Evidencia.objects.filter(eliminada_en__isnull=True).filter(
        Q(visita__in=visible_visits(user)) | Q(checklist__visita__in=visible_visits(user)) | Q(ticket__in=visible_tickets(user)) |
        Q(autor=user, visita__isnull=True, ticket__isnull=True))


class EvidenceUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        if rol_de(request.user) != "store_supervisor":
            raise PermissionDenied("Solo el reportante recupera sus adjuntos temporales.")
        files = Evidencia.objects.filter(autor=request.user, visita__isnull=True, checklist__isnull=True,
                                        ticket__isnull=True, eliminada_en__isnull=True).order_by("pk")
        return Response([evidence_data(file) for file in files])

    @transaction.atomic
    def post(self, request):
        serializer = UploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        file = data["foto"]
        if file.size <= 0 or file.size > 5 * 1024 * 1024:
            raise ValidationError({"foto": "La imagen debe tener entre 1 byte y 5 MB."})
        content = file.read()
        digest = hashlib.sha256(content).hexdigest()
        formats = {"JPEG": ("image/jpeg", {".jpg", ".jpeg"}), "PNG": ("image/png", {".png"}), "WEBP": ("image/webp", {".webp"})}
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                image = Image.open(BytesIO(content))
                image.verify()
                mime, extensions = formats[image.format]
            if Path(file.name).suffix.lower() not in extensions or file.content_type != mime:
                raise ValueError()
        except (UnidentifiedImageError, OSError, ValueError, KeyError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise ValidationError({"foto": "Usa una imagen JPG, PNG o WebP válida con extensión y MIME coincidentes."})
        # Serializa reintentos y cuota temporal de archivos por autor.
        # FOR NO KEY UPDATE serializa cuotas sin bloquear las FK de los eventos
        # que otra operación puede registrar mientras mantiene bloqueada la visita.
        Usuario.objects.select_for_update(no_key=True).get(pk=request.user.pk)
        existing = Evidencia.objects.filter(client_id=data["id"]).first()
        if existing:
            if existing.autor_id != request.user.pk or existing.sha256 != digest or existing.visita_id != data.get("visitId") or existing.item_id != data.get("taskId") or existing.eliminada_en:
                raise Conflict("El ID de archivo ya se usó con otro contenido, contexto o autor.")
            if not visible_evidence(request.user).filter(pk=existing.pk).exists():
                raise PermissionDenied("El archivo ya no pertenece al alcance autorizado.")
            return Response(evidence_data(existing))
        visit = None
        checklist = None
        task_id = data.get("taskId")
        if data.get("visitId"):
            visit = locked_visit(request.user, data["visitId"])
            require_registration_editable(visit)
            if visit.origen == "checklist":
                checklist = visit.checklist
                if task_id not in {t["id"] for t in checklist.tareas_snapshot}:
                    raise ValidationError({"taskId": "Ítem ajeno a la plantilla de esta ejecución."})
            elif task_id:
                raise ValidationError({"taskId": "El ticket no tiene tareas de checklist."})
            count = visit.archivos.filter(item_id=task_id, eliminada_en__isnull=True).count()
        else:
            if rol_de(request.user) != "store_supervisor" or task_id:
                raise PermissionDenied("Los adjuntos temporales son para reportes del supervisor de tienda.")
            count = Evidencia.objects.filter(autor=request.user, visita__isnull=True, ticket__isnull=True, eliminada_en__isnull=True).count()
        if count >= 5:
            raise ValidationError({"foto": "Máximo 5 fotografías por tarea, resolución o reporte pendiente."})
        if data.get("capturedAt") and data["capturedAt"] > timezone.now() + timezone.timedelta(seconds=5):
            raise ValidationError({"capturedAt": "La fecha declarada no puede estar en el futuro."})
        if visit:
            prepare_registration_edit(request.user, visit)
        file.seek(0)
        evidence = Evidencia(autor=request.user, client_id=data["id"], visita=visit, checklist=checklist,
                            item_id=task_id, foto=file, nombre=file.name, mime_type=mime, tamano=file.size,
                            sha256=digest, origen=data["source"], capturada_en=data.get("capturedAt"))
        try:
            evidence.save()
        except Exception:
            if evidence.foto and evidence.foto.name:
                evidence.foto.storage.delete(evidence.foto.name)
            raise
        return Response(evidence_data(evidence), status=201)


class EvidenceDetailView(APIView):
    def get(self, request, pk):
        evidence = get_object_or_404(visible_evidence(request.user), client_id=pk)
        return Response(evidence_data(evidence))

    @transaction.atomic
    def delete(self, request, pk):
        evidence = get_object_or_404(Evidencia.objects.select_for_update(), client_id=pk, autor=request.user)
        if evidence.eliminada_en:
            return Response(status=204)
        if evidence.ticket_id:
            raise Conflict("El reporte original conserva sus evidencias.")
        visit_id = evidence.visita_id or (evidence.checklist.visita_id if evidence.checklist_id else None)
        if visit_id:
            visit = locked_visit(request.user, visit_id)
            require_registration_editable(visit)
            prepare_registration_edit(request.user, visit)
        evidence.eliminada_en = timezone.now()
        evidence.save(update_fields=["eliminada_en"])
        return Response(status=204)


class EvidenceFileView(APIView):
    def get(self, request, pk):
        evidence = get_object_or_404(visible_evidence(request.user), client_id=pk)
        try:
            file = evidence.foto.open("rb")
        except FileNotFoundError:
            raise NotFound("El archivo no está disponible en el almacenamiento.")
        response = FileResponse(file, content_type=evidence.mime_type or "application/octet-stream", filename=evidence.nombre)
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
