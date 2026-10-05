from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Ticket, Visita, Usuario, CategoriaProblema, NivelUrgencia, Evidencia, Evento, ReasignacionTicket, ClienteEspecialidad
from .permissions import rol_de, tiendas_visibles_para, tecnicos_elegibles_para
from .services import Conflict, idempotent, visible_tickets, event
from .generation import applicable_contract, snapshot
from .serializers import ticket_data
from .workflow import TICKET_WORK_STATUS


class TicketInputSerializer(serializers.Serializer):
    storeId = serializers.IntegerField(min_value=1)
    categoryId = serializers.PrimaryKeyRelatedField(queryset=CategoriaProblema.objects.filter(activo=True))
    priorityId = serializers.PrimaryKeyRelatedField(queryset=NivelUrgencia.objects.all())
    description = serializers.CharField(min_length=10, max_length=500)
    evidenceIds = serializers.ListField(child=serializers.UUIDField(), max_length=5)


class ScheduleInputSerializer(serializers.Serializer):
    technicianId = serializers.IntegerField(min_value=1)
    scheduledAt = serializers.DateTimeField()
    priorityId = serializers.PrimaryKeyRelatedField(queryset=NivelUrgencia.objects.all())
    reason = serializers.CharField(max_length=500, allow_blank=True)
    revision = serializers.IntegerField(min_value=0)


class TicketListCreateView(APIView):
    def get(self, request):
        return Response([ticket_data(t) for t in visible_tickets(request.user).order_by("-creado_en", "-pk")])

    def post(self, request):
        if rol_de(request.user) != "store_supervisor":
            raise PermissionDenied("Solo el supervisor de tienda reporta incidencias.")
        def work():
            serializer = TicketInputSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            store = get_object_or_404(tiendas_visibles_para(request.user).select_for_update(of=("self",)), pk=data["storeId"], activo=True)
            if not ClienteEspecialidad.objects.filter(cliente_id=store.cliente_id, categoria=data["categoryId"], activo=True,
                                                      categoria__activo=True).exists():
                raise ValidationError({"categoryId": "La especialidad no está habilitada para el cliente de esta tienda."})
            if len(set(data["evidenceIds"])) != len(data["evidenceIds"]):
                raise ValidationError({"evidenceIds": "No repitas fotografías."})
            # Bloqueo ordenado protege dos tickets que intenten asociar el mismo adjunto.
            files = list(Evidencia.objects.select_for_update().filter(client_id__in=data["evidenceIds"]).order_by("pk"))
            if len(files) != len(data["evidenceIds"]) or any(e.autor_id != request.user.pk or e.ticket_id or e.visita_id or e.eliminada_en for e in files):
                raise ValidationError({"evidenceIds": "Archivo ajeno, eliminado o asociado a otro contexto."})
            ticket = Ticket.objects.create(tienda=store, categoria=data["categoryId"], urgencia=data["priorityId"],
                                           descripcion=data["description"], reportado_por=request.user)
            for evidence in files:
                evidence.ticket = ticket
                evidence.save(update_fields=["ticket"])
            Evento.objects.create(ticket=ticket, actor=request.user, tipo="report", texto="Incidencia reportada")
            return ticket_data(ticket)
        return Response(idempotent(request, work), status=201)


class TicketDetailView(APIView):
    def get(self, request, pk):
        return Response(ticket_data(get_object_or_404(visible_tickets(request.user), pk=pk)))


class ScheduleView(APIView):
    def post(self, request, pk):
        if rol_de(request.user) != "account_supervisor":
            raise PermissionDenied("Solo el supervisor de cuenta puede programar.")
        def work():
            if Ticket.objects.filter(pk=pk, tienda__zona_id=None,
                tienda__cliente_id__in=request.user.coberturas.filter(activo=True, zona__activo=True).values("cliente_id")).exists():
                raise ValidationError({"storeId": "La tienda no tiene zona. Administración debe asignarla antes de programar."})
            ticket = get_object_or_404(visible_tickets(request.user).select_for_update(of=("self",)), pk=pk)
            serializer = ScheduleInputSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            if ticket.revision != data["revision"]:
                raise Conflict("Otra programación fue registrada. Actualiza el ticket.")
            if TICKET_WORK_STATUS.get(ticket.estado) != "pending":
                raise Conflict("Solo se puede programar o cambiar de técnico un ticket en estado Pendiente.")
            scheduled = data["scheduledAt"]
            if scheduled < timezone.now():
                raise ValidationError({"scheduledAt": "La programación debe ser futura."})
            technician = get_object_or_404(Usuario.objects.filter(is_active=True).select_for_update(), pk=data["technicianId"])
            if ticket.tienda.zona_id is None:
                raise ValidationError({"storeId": "La tienda no tiene zona. Administración debe asignarla antes de programar."})
            if rol_de(technician) != "technician" or not tecnicos_elegibles_para(ticket.tienda).filter(pk=technician.pk).exists():
                raise ValidationError({"technicianId": "Técnico sin cobertura activa para el Cliente + Zona de la tienda."})
            if ticket.tecnico_asignado_id and len(data["reason"].strip()) < 10:
                raise ValidationError({"reason": "Reprogramar o reasignar requiere motivo de al menos 10 caracteres."})
            contract = applicable_contract(ticket.tienda, timezone.localdate(scheduled))
            old = {"technicianId": ticket.tecnico_asignado_id, "scheduledAt": ticket.fecha_programada.isoformat() if ticket.fecha_programada else None,
                   "priorityId": ticket.urgencia_id}
            prior_visits = list(ticket.visitas_generadas.select_for_update().filter(vigente=True))
            for previous in prior_visits:
                if previous.iniciado_en:
                    raise Conflict("La atención ya inició; conserva su técnico y ejecución. Solo se reasigna estando Pendiente.")
                previous.vigente = False
                previous.estado = "no_realizada"
                previous.save(update_fields=["vigente", "estado"])
                event(request.user, previous, "invalidate", "Programación sustituida", {"reason": data["reason"]})
            visit = Visita(tienda=ticket.tienda, origen="ticket", ticket_origen=ticket, tecnico=technician,
                           fecha_programada=scheduled, estado="programada")
            snapshot(visit, contract)
            visit.save()
            ReasignacionTicket.objects.create(ticket=ticket, tecnico_anterior=ticket.tecnico_asignado,
                tecnico_nuevo=technician, reasignado_por=request.user, motivo=data["reason"],
                fecha_anterior=ticket.fecha_programada, fecha_nueva=scheduled,
                urgencia_anterior=ticket.urgencia, urgencia_nueva=data["priorityId"])
            ticket.tecnico_asignado = technician
            ticket.fecha_programada = scheduled
            ticket.urgencia = data["priorityId"]
            ticket.estado = "programado"
            ticket.revision += 1
            ticket.save()
            event(request.user, visit, "schedule", "Ticket programado" if not old["technicianId"] else "Ticket reprogramado / reasignado",
                  {"previous": old, "next": {"technicianId": technician.pk, "scheduledAt": scheduled.isoformat(),
                    "priorityId": ticket.urgencia_id}, "reason": data["reason"]})
            return ticket_data(ticket)
        return Response(idempotent(request, work))


class CloseTicketView(APIView):
    def post(self, request, pk):
        def work():
            ticket = get_object_or_404(visible_tickets(request.user).select_for_update(), pk=pk)
            if ticket.estado not in ("resuelto", "cerrado"):
                raise Conflict("La resolución o su revisión todavía no fue aceptada.")
            # Compatibilidad: Finalizado es terminal; no crea una segunda etapa
            # ni inventa una fecha adicional de fin físico o confirmación.
            return ticket_data(ticket)
        return Response(idempotent(request, work))
