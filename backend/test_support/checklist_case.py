import os
import sys
import uuid
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.test_settings")
import django
django.setup()
from django.db import connection, transaction
from core.models import Cliente, Tienda, Zona, Usuario, Visita
from core.generation import generate_month
if os.environ["DJANGO_SETTINGS_MODULE"] != "config.test_settings" or connection.settings_dict["NAME"] != "nf_integration":
    raise RuntimeError("Solo base aislada.")
with transaction.atomic():
    client = Cliente.objects.get(ruc="E2E-ONLY")
    zone = Zona.objects.get(cliente=client, nombre="Zona explícita E2E")
    store = Tienda.objects.create(cliente=client, zona=zone, nombre="E2E checklist case "+str(uuid.uuid4()), direccion="Test-only store", latitud="-12.173900", longitud="-77.018100")
    generate_month(Usuario.objects.get(username="tech"))
    print(Visita.objects.get(tienda=store, origen="checklist").pk)
