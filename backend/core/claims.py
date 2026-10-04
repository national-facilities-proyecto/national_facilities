"""Reservas de checklist: el plazo nunca afecta a una ejecución iniciada."""
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from .models import Visita, Evento

CLAIM_DURATION = timedelta(hours=2)


@transaction.atomic
def release_expired_claims(stores=None):
    now = timezone.now()
    visits = Visita.objects.filter(
        origen="checklist", vigente=True, estado="programada", tecnico__isnull=False,
        iniciado_en__isnull=True, formulario_abierto_en__isnull=True, enviado_en__isnull=True,
        reclamo_vence_en__lte=now,
    )
    if stores is not None:
        visits = visits.filter(tienda__in=stores)
    released = 0
    for visit in visits.order_by("pk").select_for_update(of=("self",)):
        data = {"actorKind": "system", "technicianId": visit.tecnico_id,
                "claimedAt": visit.reclamada_en.isoformat(),
                "expiresAt": visit.reclamo_vence_en.isoformat(),
                "releasedAt": now.isoformat(), "reason": "unstarted_claim_timeout"}
        visit.tecnico = None
        visit.reclamada_en = None
        visit.reclamo_vence_en = None
        visit.save(update_fields=["tecnico", "reclamada_en", "reclamo_vence_en"])
        Evento.objects.create(visita=visit, actor=None, tipo="claim_release",
                              texto="Reserva liberada automáticamente tras dos horas sin iniciar", datos=data)
        released += 1
    return released
