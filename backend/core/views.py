from django.db import transaction
from django.db.models import Q
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework import serializers
from .models import (Cliente, Tienda, Contrato, PlantillaChecklist, ItemPlantilla, Usuario,
                     CategoriaProblema, NivelUrgencia, Rol, Evento, Ticket)
from .permissions import tiendas_visibles_para, EsTecnico, EsAdministrador, EsSupervisorCuenta, rol_de
from .serializers import (TiendaSerializer, ClienteSerializer, ContratoSerializer,
                          PlantillaChecklistSerializer, ItemPlantillaSerializer, UsuarioSerializer,
                          visit_data)
from .auth_views import identity, PasswordView as CambiarPasswordView
from .evidence_views import EvidenceUploadView as EvidenciaListCreateView, EvidenceDetailView, visible_evidence
from .ticket_views import TicketListCreateView, TicketDetailView, ScheduleView as TicketScheduleView
from .report_views import DashboardView, ExportView as ReporteVisitasExportView, ReportListView as ReporteVisitasListView
from .services import (idempotent, visible_visits, claim_visit, start_visit,
                       open_form, save_draft, complete_visit, locked_visit, Conflict, event, validate_content, record_end_gps, finalize_reviewed_visit, asegurar_bolsa_mes_actual)
from .generation import generate_month
from .claims import release_expired_claims
from .input_serializers import ExceptionInputSerializer, ReviewInputSerializer


class TiendaListView(ListAPIView):
    serializer_class = TiendaSerializer
    def get_queryset(self):
        return tiendas_visibles_para(self.request.user)


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        from django.db import connection, DatabaseError
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except DatabaseError:
            return Response({"status": "unavailable"}, status=503)
        return Response({"status": "ok"})


class TiendaDetailView(RetrieveAPIView):
    serializer_class = TiendaSerializer
    def get_queryset(self):
        return tiendas_visibles_para(self.request.user)


class UsersView(APIView):
    def get(self, request):
        role = rol_de(request.user)
        if role == "administrator":
            users = Usuario.objects.all()
        else:
            stores = tiendas_visibles_para(request.user)
            users = Usuario.objects.filter(Q(pk=request.user.pk) | Q(tiendas_asignadas__tienda__in=stores, tiendas_asignadas__activo=True)).distinct()
        allowed = set(tiendas_visibles_para(request.user).values_list("pk", flat=True))
        return Response([{**identity(u), "storeIds": [pk for pk in identity(u)["storeIds"] if pk in allowed]}
                         for u in users if rol_de(u)])


class CatalogsView(APIView):
    def get(self, request):
        return Response({
            "categories": [{"id": c.pk, "name": c.nombre} for c in CategoriaProblema.objects.filter(activo=True)],
            "priorities": [{"id": c.pk, "name": c.nombre, "firstResponseHours": c.sla_primera_respuesta_horas,
                            "resolutionHours": c.sla_resolucion_horas} for c in NivelUrgencia.objects.all()],
            "roles": [{"id": r.pk, "name": r.nombre} for r in Rol.objects.all()],
        })


class VisitListView(APIView):
    origin = None
    def get(self, request):
        visits = visible_visits(request.user).order_by("-fecha_programada", "pk")
        release_expired_claims(tiendas_visibles_para(request.user))
        if self.origin:
            visits = visits.filter(origen=self.origin)
        return Response([visit_data(v) for v in visits])


class ChecklistListView(VisitListView):
    origin = "checklist"


class ScheduledVisitListView(VisitListView):
    origin = "ticket"


class VisitPoolListView(VisitListView):
    permission_classes = [EsTecnico]
    def get(self, request):
        asegurar_bolsa_mes_actual(request.user)
        return Response([visit_data(v) for v in visible_visits(request.user).filter(origen="checklist", tecnico__isnull=True, estado="programada")])


class GenerateMonthInput(serializers.Serializer):
    period = serializers.DateField(required=False)

    def validate_period(self, value):
        from django.utils import timezone
        if value != timezone.localdate().replace(day=1):
            raise ValidationError("La bolsa operativa se genera para el primer día del mes actual.")
        return value


class GenerateMonthView(APIView):
    permission_classes = [EsTecnico]
    def post(self, request):
        def work():
            serializer = GenerateMonthInput(data=request.data)
            serializer.is_valid(raise_exception=True)
            return {"visitIds": generate_month(request.user, serializer.validated_data.get("period"))}
        return Response(idempotent(request, work))


class VisitDetailView(APIView):
    def get(self, request, pk):
        release_expired_claims(tiendas_visibles_para(request.user))
        return Response(visit_data(get_object_or_404(visible_visits(request.user), pk=pk)))


class VisitActionView(APIView):
    permission_classes = [EsTecnico]
    action = ""
    def post(self, request, pk):
        # Fuera de la transacción idempotente: un inicio rechazado no revierte la liberación.
        if self.action in ("claim", "start"):
            release_expired_claims(tiendas_visibles_para(request.user))
        def work():
            if self.action == "claim":
                visit = claim_visit(request.user, pk)
            elif self.action == "start":
                visit = start_visit(request.user, pk, request.data)
            elif self.action == "open_form":
                visit = open_form(request.user, pk, request.data)
            elif self.action == "draft":
                visit = save_draft(request.user, pk, request.data)
            elif self.action == "complete":
                visit = complete_visit(request.user, pk, request.data)
            elif self.action == "end_gps":
                visit = record_end_gps(request.user, pk, request.data)
            elif self.action == "submit_review":
                from .services import submit_review
                visit = submit_review(request.user, pk, request.data)
            else:
                raise ValidationError("Acción inválida.")
            return visit_data(visit)
        return Response(idempotent(request, work))


class ExceptionRequestView(APIView):
    permission_classes = [EsTecnico]
    exception_type = None
    def post(self, request, pk):
        def work():
            from django.utils import timezone
            visit = locked_visit(request.user, pk)
            if not visit.iniciado_en or not visit.formulario_abierto_en or visit.estado not in ("en_curso", "pendiente_validacion"):
                raise Conflict("No hay un formulario en ejecución o pendiente.")
            payload = request.data.copy()
            exception_type = self.exception_type
            if exception_type is None:
                # Los alias de urls.py conservan el tipo indicado por su URL.
                endpoint = request.path.rstrip("/").rsplit("/", 1)[-1]
                exception_type = {"excepcion-ubicacion": "location", "excepcion-tiempo": "time_limit"}.get(endpoint)
            if exception_type:
                if payload.get("type") not in (None, exception_type):
                    raise ValidationError({"type": "El tipo de excepción no corresponde a esta ruta."})
                payload["type"] = exception_type
            serializer = ExceptionInputSerializer(data=payload)
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            if data["type"] == "location":
                validate_content(visit)
            from .services import request_or_correct_exception
            request_or_correct_exception(request.user, visit, data)
            visit.estado = "pendiente_validacion"
            newly_submitted = False
            if not visit.enviado_en:
                try:
                    validate_content(visit)
                    visit.enviado_en = timezone.now()
                    newly_submitted = True
                except ValidationError:
                    pass  # Un borrador incompleto sigue pendiente; no inventa un envío aceptado.
            visit.save(update_fields=["estado", "enviado_en"])
            if newly_submitted:
                event(request.user, visit, "review_submission", "Registro completo enviado para revisión",
                      {"draftRevision": visit.borrador_revision, "submittedAt": visit.enviado_en.isoformat()})
            if visit.ticket_origen_id:
                Ticket.objects.filter(pk=visit.ticket_origen_id).update(estado="pendiente_validacion")
            return visit_data(visit)
        return Response(idempotent(request, work))


class ExceptionReviewView(APIView):
    permission_classes = [EsSupervisorCuenta]
    def post(self, request, pk):
        def work():
            from django.utils import timezone
            visit = locked_visit(request.user, pk, owner=False)
            serializer = ReviewInputSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            exception = get_object_or_404(visit.excepciones.select_for_update(), pk=data["exceptionId"])
            if data["revision"] != visit.borrador_revision or data["exceptionRevision"] != exception.revision:
                raise Conflict("El contenido o la justificación cambió. Recarga antes de tomar una decisión.")
            decision = "approved" if data["approved"] else "rejected"
            if exception.decision != "pending":
                if exception.decision != decision or exception.motivo_decision != data["reason"]:
                    raise Conflict("La excepción ya tiene una decisión registrada.")
                return visit_data(visit)
            if data["approved"]:
                validate_content(visit)
                if not visit.enviado_en:
                    raise ValidationError({"content": "El técnico todavía debe enviar el registro completo para revisión."})
            exception.decision = decision
            exception.revisor = request.user
            exception.motivo_decision = data["reason"]
            exception.revisada_en = timezone.now()
            exception.save()
            from .services import audit_exception
            audit_exception(request.user, visit, exception, "review", "Justificación "+exception.tipo+": "+decision)
            finalize_reviewed_visit(request.user, visit)
            return visit_data(visit)
        return Response(idempotent(request, work))


class AdminViewSet(ModelViewSet):
    permission_classes = [EsAdministrador]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def create(self, request, *args, **kwargs):
        def work():
            self.lock_parent(request.data)
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            self.audit(request.user, "admin_create", serializer.instance.pk, None, serializer.data)
            return serializer.data
        return Response(idempotent(request, work), status=201)

    def update(self, request, *args, **kwargs):
        def work():
            instance = get_object_or_404(self.get_queryset().select_for_update(), pk=kwargs["pk"])
            previous = self.get_serializer(instance).data
            self.lock_parent(request.data)
            serializer = self.get_serializer(instance, data=request.data, partial=kwargs.get("partial", False))
            serializer.is_valid(raise_exception=True)
            serializer.save()
            self.audit(request.user, "admin_update", instance.pk, previous, serializer.data)
            return serializer.data
        return Response(idempotent(request, work))

    def lock_parent(self, data):
        if self.queryset.model == Contrato and data.get("clientId"):
            get_object_or_404(Cliente.objects.select_for_update(), pk=data["clientId"])

    def audit(self, actor, kind, pk, previous, current):
        from rest_framework.renderers import JSONRenderer
        import json
        data = {"entity": self.queryset.model.__name__, "id": pk, "previous": previous, "next": current}
        Evento.objects.create(actor=actor, tipo=kind, texto="Administración: "+self.queryset.model.__name__,
                              datos=json.loads(JSONRenderer().render(data)))

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        instance = get_object_or_404(self.get_queryset().select_for_update(), pk=kwargs["pk"])
        previous = self.get_serializer(instance).data
        pk = instance.pk
        if isinstance(instance, Usuario) and instance.pk == request.user.pk:
            raise Conflict("No puedes eliminar tu propia cuenta.")
        if isinstance(instance, ItemPlantilla):
            instance.activo = False
            instance.save(update_fields=["activo"])
        else:
            try:
                instance.delete()
            except ProtectedError:
                raise Conflict("El registro tiene historial protegido; desactívalo para conservar la trazabilidad.")
        self.audit(request.user, "admin_delete", pk, previous, None)
        return Response(status=204)


class ClienteViewSet(AdminViewSet):
    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer


class TiendaAdminViewSet(AdminViewSet):
    queryset = Tienda.objects.all()
    serializer_class = TiendaSerializer


class ContratoViewSet(AdminViewSet):
    queryset = Contrato.objects.all()
    serializer_class = ContratoSerializer


class PlantillaChecklistViewSet(AdminViewSet):
    queryset = PlantillaChecklist.objects.all()
    serializer_class = PlantillaChecklistSerializer


class ItemPlantillaViewSet(AdminViewSet):
    queryset = ItemPlantilla.objects.all()
    serializer_class = ItemPlantillaSerializer
    http_method_names = ["get", "head", "options"]


class UsuarioViewSet(AdminViewSet):
    queryset = Usuario.objects.all()
    serializer_class = UsuarioSerializer


class TecnicoListView(ListAPIView):
    serializer_class = UsuarioSerializer
    permission_classes = [EsSupervisorCuenta]

    def get_queryset(self):
        stores = tiendas_visibles_para(self.request.user)
        candidates = Usuario.objects.filter(is_active=True, tiendas_asignadas__activo=True,
                                            tiendas_asignadas__tienda__in=stores).select_related("rol").distinct()
        return [user for user in candidates if rol_de(user) == "technician"]


class EvidenciaDetailView(EvidenceDetailView):
    """El ID numérico de main usa la misma lectura y eliminación protegida del PR."""
    def client_id(self, request, pk):
        return get_object_or_404(visible_evidence(request.user), pk=pk).client_id

    def get(self, request, pk):
        return super().get(request, self.client_id(request, pk))

    def delete(self, request, pk):
        return super().delete(request, self.client_id(request, pk))


class VisitaNoRealizadaInput(serializers.Serializer):
    reason = serializers.CharField(min_length=10, max_length=500)


class VisitaNoRealizadaView(APIView):
    permission_classes = [EsTecnico]

    def post(self, request, pk):
        release_expired_claims(tiendas_visibles_para(request.user))
        def work():
            visit = locked_visit(request.user, pk)
            if visit.estado != "programada" or visit.iniciado_en or visit.formulario_abierto_en or visit.enviado_en or visit.completado_en:
                raise Conflict("Solo una visita pendiente sin iniciar puede marcarse como no realizada.")
            serializer = VisitaNoRealizadaInput(data=request.data)
            serializer.is_valid(raise_exception=True)
            visit.estado = "no_realizada"
            visit.justificacion = serializer.validated_data["reason"]
            visit.save(update_fields=["estado", "justificacion"])
            event(request.user, visit, "not_performed", "Visita no realizada", {"reason": visit.justificacion})
            return visit_data(visit)
        return Response(idempotent(request, work))


# Nombres de main que comparten la implementación del flujo vigente.
VisitaPoolListView = VisitPoolListView
VisitaProgramadasListView = ScheduledVisitListView
VisitaDetailView = VisitDetailView
VisitaReviewExceptionView = ExceptionReviewView


class VisitaTomarView(VisitActionView):
    action = "claim"


class ChecklistSaveDraftView(VisitActionView):
    action = "draft"


class VisitaStartView(VisitActionView):
    action = "start"


class VisitaCompleteView(VisitActionView):
    action = "complete"


class VisitaLocationExceptionView(ExceptionRequestView):
    exception_type = "location"


class VisitaTimeExceptionView(ExceptionRequestView):
    exception_type = "time_limit"
