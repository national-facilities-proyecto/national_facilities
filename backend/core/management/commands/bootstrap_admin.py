import os
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from core.models import Rol, Usuario


class Command(BaseCommand):
    help = "Crea el administrador inicial con NF_ADMIN_PASSWORD; no reemplaza credenciales existentes."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True)
        parser.add_argument("--email", required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        if Usuario.objects.filter(username=options["username"]).exists():
            raise CommandError("El usuario ya existe. Gestiona su rol/credenciales explícitamente; no se sobrescribe.")
        password = os.environ.get("NF_ADMIN_PASSWORD", "")
        if not password:
            raise CommandError("Configura NF_ADMIN_PASSWORD para la contraseña inicial.")
        role = Rol.objects.get_or_create(nombre="Administrador")[0]
        user = Usuario(username=options["username"], email=options["email"], rol=role, is_staff=True, is_superuser=True)
        try:
            validate_password(password, user)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages))
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS("Administrador creado; deberá cambiar la contraseña inicial al ingresar."))
