import json
from pathlib import Path
from django.core.management.base import BaseCommand
from django.db import transaction
from core.models import Rol, CategoriaProblema, NivelUrgencia, PlantillaChecklist, ItemPlantilla


class Command(BaseCommand):
    help = "Inicializa roles y catálogos sin sobrescribir registros existentes ni cargar cuentas ficticias."

    @transaction.atomic
    def handle(self, *args, **options):
        for name in ["Tecnico", "Supervisor de tienda", "Supervisor de cuenta", "Administrador"]:
            Rol.objects.get_or_create(nombre=name)
        path = Path(__file__).resolve().parents[2] / "fixtures" / "catalogos_iniciales.json"
        entries = json.loads(path.read_text(encoding="utf-8"))
        template, created = PlantillaChecklist.objects.get_or_create(nombre="Checklist estándar MASS", defaults={"version": 1})
        for entry in entries:
            fields = entry["fields"]
            if entry["model"] == "core.categoriaproblema":
                CategoriaProblema.objects.get_or_create(nombre=fields["nombre"], defaults={"activo": True})
            elif entry["model"] == "core.nivelurgencia":
                NivelUrgencia.objects.get_or_create(nombre=fields["nombre"], defaults={k: v for k, v in fields.items() if k != "nombre"})
            elif entry["model"] == "core.itemplantilla" and created:
                ItemPlantilla.objects.create(plantilla=template, **{k: v for k, v in fields.items() if k != "plantilla"})
        self.stdout.write(self.style.SUCCESS("Roles y catálogos inicializados. SLA del catálogo no implica calendario laboral validado."))
