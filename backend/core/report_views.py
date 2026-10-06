import csv
import io
from datetime import date
from calendar import monthrange
from django.http import HttpResponse
from django.db.models import Q, Count
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from .permissions import EsSupervisorCuenta, tiendas_visibles_para
from .models import Contrato, Cliente
from .services import visible_visits, visible_tickets
from .serializers import visit_data
from .workflow import WORK_STATUS_LABELS


def report_scope(request):
    try:
        period = date.fromisoformat(request.query_params.get("period", timezone.localdate().replace(day=1).isoformat()))
        if period.day != 1:
            raise ValueError()
    except ValueError:
        raise ValidationError({"period": "Usa YYYY-MM-01."})
    end = period.replace(day=monthrange(period.year, period.month)[1])
    stores = tiendas_visibles_para(request.user)
    client_id = request.query_params.get("clientId")
    if client_id:
        try:
            client_id = int(client_id)
        except ValueError:
            raise ValidationError({"clientId": "Identificador inválido."})
        if not stores.filter(cliente_id=client_id).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("El cliente no pertenece a tu cartera.")
        stores = stores.filter(cliente_id=client_id)
    visits = visible_visits(request.user).filter(tienda__in=stores).filter(
        Q(origen="checklist", periodo=period) | Q(origen="ticket", fecha_programada__date__range=(period, end)))
    tickets = visible_tickets(request.user).filter(tienda__in=stores, creado_en__date__range=(period, end))
    return period, end, stores, visits, tickets


class DashboardView(APIView):
    permission_classes = [EsSupervisorCuenta]
    def get(self, request):
        period, end, stores, visits, tickets = report_scope(request)
        checklists = visits.filter(origen="checklist", vigente=True)
        completed = checklists.filter(estado="completada").count()
        required = 0
        risks = []
        # Atenciones finalizadas en el período; el mes de reporte del ticket
        # puede ser anterior y un checklist nunca suma como atención de ticket.
        accepted_tickets = visible_tickets(request.user).filter(tienda__in=stores,
            estado__in=["resuelto", "cerrado"], resuelto_en__date__range=(period, end),
            visitas_generadas__vigente=True, visitas_generadas__estado="completada")
        per_store = {row["tienda_id"]: row["total"] for row in accepted_tickets.values("tienda_id").annotate(total=Count("pk", distinct=True))}
        published_minima = {}
        for visit in checklists.order_by("cuota"):
            if visit.minimo_mensual_snapshot:
                published_minima.setdefault(visit.tienda_id, visit.minimo_mensual_snapshot)
        for client in Cliente.objects.filter(pk__in=stores.values("cliente_id")).distinct():
            recorded_quota = checklists.filter(tienda__cliente=client).count()
            required += recorded_quota
            contracts = Contrato.objects.filter(cliente=client, activo=True, fecha_inicio__lte=end).filter(Q(fecha_fin__isnull=True) | Q(fecha_fin__gte=period))
            # Contratos consecutivos son válidos; el snapshot publicado manda.
            as_of = min(timezone.localdate(), end)
            contract = contracts.filter(fecha_inicio__lte=as_of).filter(Q(fecha_fin__isnull=True) | Q(fecha_fin__gte=as_of)).first()
            if not contract:
                contract = contracts.order_by("fecha_inicio").first()
            # Las cuotas publicadas no cambian al editar/desactivar el contrato.
            # Solo estima obligaciones actuales de tiendas todavía sin bolsa.
            if contract and period == timezone.localdate().replace(day=1):
                missing = stores.filter(cliente=client, activo=True).exclude(pk__in=checklists.values("tienda_id")).count()
                required += missing*contract.frecuencia_visitas_mensual
            for store in stores.filter(cliente=client).filter(Q(activo=True) | Q(pk__in=checklists.values("tienda_id"))).order_by("pk"):
                minimum = published_minima.get(store.pk, contract.minimo_intervenciones_mensual if contract else 2)
                count = per_store.get(store.pk, 0)
                risks.append({"storeId": store.pk, "store": store.nombre, "clientId": client.pk,
                    "client": client.razon_social, "completed": count, "required": minimum, "missing": max(0, minimum-count)})
        status_map = {"abierto": "open", "programado": "scheduled", "en_proceso": "in_progress", "pendiente_validacion": "pending_approval", "correccion_requerida": "correction_required", "resuelto": "resolved", "cerrado": "closed"}
        durations = [(t.resuelto_en-t.creado_en).total_seconds()/3600 for t in tickets if t.resuelto_en]
        return Response({"period": period.isoformat(), "compliance": completed/required*100 if required else None,
            "pendingVisits": max(0, required-completed), "pendingExceptions": visits.filter(estado="pendiente_validacion", enviado_en__isnull=False, excepciones__decision="pending").distinct().count(),
            "ticketsByStatus": {translated: tickets.filter(estado=state).count() for state, translated in status_map.items()},
            "averageHours": sum(durations)/len(durations) if durations else None, "risks": risks,
            "risksReason": None,
            "sla": None, "slaReason": "Definición de SLA aplazada por el usuario.",
            "clients": [{"id": c.pk, "name": c.razon_social} for c in Cliente.objects.filter(
                pk__in=tiendas_visibles_para(request.user).values("cliente_id")).distinct()]})


class ExportView(APIView):
    permission_classes = [EsSupervisorCuenta]
    def get(self, request):
        period, end, stores, visits, tickets = report_scope(request)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["visita", "tienda", "origen", "contrato", "periodo", "cuota", "cuotas_mes", "estado", "estado_interno", "inicio_real", "fin_fisico", "primera_apertura", "vencimiento",
                         "envio_aceptado", "finalizacion_aprobada", "duracion_intervencion_s", "previo_formulario_s",
                         "registro_s", "excepcion_tiempo", "excepcion_gps"])
        def safe(value):
            text = str(value) if value is not None else ""
            return "'"+text if text.startswith(("=", "+", "-", "@", "\t", "\r")) else text
        for visit in visits.order_by("pk"):
            data = visit_data(visit)
            exceptions = list(visit.excepciones.order_by("pk"))
            def decisions(kind):
                return "; ".join(f"{e.scope}:{e.decision}" for e in exceptions if e.tipo == kind)
            writer.writerow([safe(value) for value in [visit.pk, visit.tienda_snapshot.get("name", visit.tienda.nombre), visit.origen,
                visit.contrato_id, data["period"], data["quota"], data["quotaCount"], WORK_STATUS_LABELS[data["workStatus"]], visit.estado,
                data["startedAt"], data["physicalEndedAt"], data["formOpenedAt"], data["expiresAt"], data["submittedAt"], data["completedAt"],
                data["totalSeconds"], data["executionSeconds"], data["registrationSeconds"],
                decisions("time_limit"), decisions("location")]])
        response = HttpResponse("\ufeff"+output.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="intervenciones-{period:%Y-%m}.csv"'
        response["Cache-Control"] = "private, no-store"
        return response


class ReportListView(APIView):
    permission_classes = [EsSupervisorCuenta]
    def get(self, request):
        period, end, stores, visits, tickets = report_scope(request)
        return Response([visit_data(visit) for visit in visits.order_by("pk")])
