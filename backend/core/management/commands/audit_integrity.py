import json
from django.core.management.base import BaseCommand
from django.db.models import Count, Q
from core.models import Visita, RespuestaItem, Evidencia, Contrato


class Command(BaseCommand):
    help = "Auditoría de solo lectura del esquema actual. Las migraciones auditan su esquema previo sin modificar historial."

    def handle(self, *args, **options):
        duplicates = list(RespuestaItem.objects.values("checklist_id", "item_id").annotate(count=Count("pk")).filter(count__gt=1))
        repeated_visits = list(Visita.objects.filter(origen="ticket", vigente=True).values("ticket_origen_id").annotate(count=Count("pk")).filter(count__gt=1))
        overlaps = []
        contracts = list(Contrato.objects.filter(activo=True).order_by("cliente_id", "pk"))
        for index, contract in enumerate(contracts):
            for other in contracts[index+1:]:
                if other.cliente_id != contract.cliente_id:
                    continue
                if (not contract.fecha_fin or other.fecha_inicio <= contract.fecha_fin) and (not other.fecha_fin or contract.fecha_inicio <= other.fecha_fin):
                    overlaps.append([contract.pk, other.pk])
        result = {"duplicateAnswers": duplicates, "multipleActiveTicketVisits": repeated_visits,
                  "overlappingContracts": overlaps, "legacyVisits": list(Visita.objects.filter(tienda_snapshot={}).values_list("pk", flat=True)),
                  "legacyEvidence": list(Evidencia.objects.filter(Q(autor__isnull=True) | Q(mime_type="")).values_list("pk", flat=True)),
                  "unrecordedClaims": list(Visita.objects.filter(origen="checklist", vigente=True, estado="programada",
                      tecnico__isnull=False, iniciado_en__isnull=True, reclamada_en__isnull=True).values_list("pk", flat=True)),
                  "temporaryEvidence": Evidencia.objects.filter(visita__isnull=True, checklist__isnull=True, ticket__isnull=True, eliminada_en__isnull=True).count()}
        self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
