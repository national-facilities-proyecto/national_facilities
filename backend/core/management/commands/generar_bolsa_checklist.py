from django.core.management.base import BaseCommand

from core.services import asegurar_bolsa_mes_actual


class Command(BaseCommand):
    help = "Genera las visitas de checklist mensual para las tiendas que aun no la tienen este mes."

    def handle(self, *args, **options):
        creadas = asegurar_bolsa_mes_actual()
        self.stdout.write(self.style.SUCCESS(f"{creadas} visitas de checklist creadas."))