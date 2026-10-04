import time
from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, close_old_connections
from core.claims import release_expired_claims


class Command(BaseCommand):
    help = "Libera reservas de checklist vencidas sin afectar trabajos iniciados."

    def add_arguments(self, parser):
        parser.add_argument("--watch", action="store_true", help="Ejecutar periódicamente como servicio.")
        parser.add_argument("--interval", type=int, default=60)

    def handle(self, *args, **options):
        if options["interval"] < 1:
            raise CommandError("El intervalo debe ser positivo.")
        while True:
            try:
                count = release_expired_claims()
                self.stdout.write(f"Reservas liberadas: {count}")
                self.stdout.flush()
            except DatabaseError as exc:
                if not options["watch"]:
                    raise CommandError(str(exc)) from exc
                self.stderr.write("Base no disponible o migraciones pendientes; se reintentará.")
            finally:
                close_old_connections()
            if not options["watch"]:
                return
            time.sleep(options["interval"])
