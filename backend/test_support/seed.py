import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.test_settings")
import django
django.setup()
from django.conf import settings
from django.core.management import call_command
from django.db import connection
from core.models import Rol
if os.environ["DJANGO_SETTINGS_MODULE"] != "config.test_settings" or connection.settings_dict["NAME"] != "nf_integration":
    raise RuntimeError("Seeding permitido únicamente en la base aislada nf_integration.")
from core.tests import fixtures
if not Rol.objects.filter(nombre="E2E seed marker").exists():
    # Evita sobrescribir o limpiar historial; los catálogos se conservan por nombre.
    from core.models import Usuario, Cliente, Tienda, AsignacionTienda, PlantillaChecklist, ItemPlantilla, Contrato, CategoriaProblema, NivelUrgencia
    from django.utils import timezone
    from core.tests import PASSWORD
    roles = {name: Rol.objects.get_or_create(nombre=name)[0] for name in ["Tecnico", "Supervisor de cuenta", "Supervisor de tienda", "Administrador"]}
    users = {}
    for name, role in [("tech", "Tecnico"), ("othertech", "Tecnico"), ("account", "Supervisor de cuenta"), ("store", "Supervisor de tienda"), ("admin", "Administrador"), ("outsider", "Supervisor de cuenta")]:
        if Usuario.objects.filter(username=name).exists():
            raise RuntimeError("Existen usuarios del seed sin marcador; no se sobrescriben.")
        users[name] = Usuario.objects.create_user(username=name, email=f"{name}@test.invalid", password=PASSWORD, rol=roles[role], password_initialized=True)
    client = Cliente.objects.create(razon_social="E2E isolated account", ruc="E2E-ONLY")
    store = Tienda.objects.create(cliente=client, nombre="E2E isolated store", direccion="Address for tests", latitud="-12.173900", longitud="-77.018100")
    AsignacionTienda.objects.create(usuario=users["store"], tienda=store)
    template = PlantillaChecklist.objects.create(nombre="E2E isolated template")
    ItemPlantilla.objects.create(plantilla=template, descripcion="Inspect test device", foto_obligatoria=True)
    Contrato.objects.create(cliente=client, plantilla_checklist=template, fecha_inicio=timezone.localdate().replace(day=1), radio_validacion_metros=100)
    CategoriaProblema.objects.get_or_create(nombre="Eléctrico")
    NivelUrgencia.objects.get_or_create(nombre="Alta", defaults={"sla_primera_respuesta_horas": 2, "sla_resolucion_horas": 24})
    Rol.objects.create(nombre="E2E seed marker")
# Configuración explícita de fixtures conocidos; nunca opera sobre producción.
from core.models import Cliente, Tienda, Zona, CoberturaUsuario, ClienteEspecialidad, Usuario, CategoriaProblema
from django.db import transaction
with transaction.atomic():
    client = Cliente.objects.get(ruc="E2E-ONLY")
    zone, _ = Zona.objects.get_or_create(cliente=client, nombre="Zona explícita E2E")
    for store in Tienda.objects.filter(cliente=client):
        if store.zona_id is None:
            store.zona = zone
            store.save(update_fields=["zona"])
    for username in ["tech", "othertech", "account"]:
        user = Usuario.objects.select_for_update().get(username=username)
        _, created = CoberturaUsuario.objects.get_or_create(usuario=user, cliente=client, zona=zone)
        if created:
            user.auth_version += 1
            user.save(update_fields=["auth_version"])
    category = CategoriaProblema.objects.get(nombre="Eléctrico")
    ClienteEspecialidad.objects.get_or_create(cliente=client, categoria=category)
print("E2E seed listo en PostgreSQL aislado.")

