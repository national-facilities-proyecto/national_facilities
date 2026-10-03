from calendar import monthrange
from datetime import datetime, time
from django.db import transaction
from django.utils import timezone
from .models import Contrato, Visita, Checklist, PlantillaChecklist
from .permissions import tiendas_visibles_para
from .services import Conflict


def applicable_contract(store, day):
    from django.db.models import Q
    contracts = list(Contrato.objects.filter(cliente_id=store.cliente_id, activo=True, fecha_inicio__lte=day)
                     .filter(Q(fecha_fin__isnull=True) | Q(fecha_fin__gte=day)))
    if len(contracts) != 1:
        raise Conflict("No hay un contrato único vigente. Revisa las fechas y superposiciones.")
    return contracts[0]


def snapshot(visit, contract):
    visit.contrato = contract
    visit.radio_metros = contract.radio_validacion_metros
    visit.minimo_mensual_snapshot = contract.minimo_intervenciones_mensual
    store = visit.tienda
    visit.tienda_snapshot = {"name": store.nombre, "address": store.direccion,
                             "latitude": float(store.latitud), "longitude": float(store.longitud), "clientId": store.cliente_id}


@transaction.atomic
def generate_month(user, period=None):
    from django.db.models import Q
    today = timezone.localdate()
    period = period or today.replace(day=1)
    last = period.replace(day=monthrange(period.year, period.month)[1])
    result = []
    # Bloqueo de tiendas ordenado + restricción de cuota protege diferentes procesos.
    stores = tiendas_visibles_para(user).filter(activo=True).order_by("pk").select_for_update(of=("self",))
    for store in stores:
        published = list(Visita.objects.filter(tienda=store, origen="checklist", periodo=period).order_by("cuota"))
        if published:
            if [visit.cuota for visit in published] != list(range(1, len(published)+1)):
                raise Conflict("Las visitas mensuales publicadas tienen cuotas inconsistentes; conserva el historial y solicita revisión.")
            # La bolsa publicada conserva su obligación y snapshots históricos.
            # Editar un contrato no reescribe el mes ya generado.
            result.extend(visit.pk for visit in published)
            continue
        contracts = list(Contrato.objects.filter(cliente_id=store.cliente_id, activo=True, fecha_inicio__lte=last)
                         .filter(Q(fecha_fin__isnull=True) | Q(fecha_fin__gte=period)))
        if not contracts:
            continue
        if len(contracts) != 1:
            # Dos contratos consecutivos no son simultáneos. La obligación mensual
            # se publica una sola vez con el contrato vigente al generar la bolsa.
            contracts = [contract for contract in contracts if contract.fecha_inicio <= today and
                         (not contract.fecha_fin or contract.fecha_fin >= today)]
            if len(contracts) != 1:
                raise Conflict("No hay un único contrato vigente hoy para publicar la obligación mensual.")
        contract = contracts[0]
        template = PlantillaChecklist.objects.select_for_update().get(pk=contract.plantilla_checklist_id)
        tasks = [{"id": item.pk, "title": item.descripcion, "photoRequired": item.foto_obligatoria,
                  "active": True, "order": item.orden} for item in template.items.filter(activo=True).order_by("orden", "pk")]
        if not template.activa or not tasks:
            raise Conflict("El contrato necesita una plantilla activa con tareas.")
        for quota in range(1, contract.frecuencia_visitas_mensual + 1):
            visit, created = Visita.objects.get_or_create(tienda=store, origen="checklist", periodo=period, cuota=quota,
                defaults={"fecha_programada": timezone.make_aware(datetime.combine(max(period, contract.fecha_inicio), time(0))), "estado": "programada"})
            if created:
                snapshot(visit, contract)
                visit.save()
                Checklist.objects.create(visita=visit, plantilla=template, plantilla_version=template.version, tareas_snapshot=tasks)
            result.append(visit.pk)
    return result
