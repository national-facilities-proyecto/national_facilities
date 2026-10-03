from datetime import timedelta
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from core.models import Evidencia


class Command(BaseCommand):
    help = "Lista adjuntos temporales antiguos. --apply marca eliminados; conserva archivo e historial."

    def add_arguments(self, parser):
        parser.add_argument("--hours", type=int, default=24)
        parser.add_argument("--apply", action="store_true")

    @transaction.atomic
    def handle(self, *args, **options):
        if options["hours"] < 24:
            raise ValueError("La retención temporal debe ser al menos 24 horas.")
        files = Evidencia.objects.select_for_update().filter(visita__isnull=True, checklist__isnull=True, ticket__isnull=True,
            eliminada_en__isnull=True, subida_en__lt=timezone.now()-timedelta(hours=options["hours"]))
        ids = list(files.values_list("pk", flat=True))
        self.stdout.write(f"Adjuntos temporales elegibles: {ids}")
        if options["apply"]:
            files.update(eliminada_en=timezone.now())
            self.stdout.write("Marcados eliminados; ningún archivo asociado a una ejecución o reporte se modificó.")
