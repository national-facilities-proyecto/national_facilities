"""Fixtures del mapa; únicamente en PostgreSQL local de integración."""

import json
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.test_settings")

import django  # noqa: E402

django.setup()

from django.db import connection, transaction  # noqa: E402
from django.utils import timezone  # noqa: E402
from core.generation import generate_month  # noqa: E402
from core.models import (  # noqa: E402
    Cliente,
    CoberturaUsuario,
    Contrato,
    ItemPlantilla,
    PlantillaChecklist,
    Rol,
    Tienda,
    Usuario,
    Visita,
    Zona,
)
from core.tests import PASSWORD  # noqa: E402

if (
    os.environ["DJANGO_SETTINGS_MODULE"] != "config.test_settings"
    or connection.settings_dict["NAME"] != "nf_integration"
    or connection.settings_dict["HOST"] not in ("localhost", "127.0.0.1")
    or not Rol.objects.filter(nombre="E2E seed marker").exists()
):
    raise RuntimeError("Solo base E2E local aislada con seed ficticio.")

with transaction.atomic():
    suffix = uuid.uuid4().hex[:8]
    user = Usuario.objects.create_user(
        username=f"map-tech-{suffix}",
        first_name="Técnico mapa E2E",
        password=PASSWORD,
        rol=Rol.objects.get(nombre="Tecnico"),
        password_initialized=True,
    )
    stores, visits = [], []
    if "--empty" not in sys.argv:
        client = Cliente.objects.create(
            razon_social="Cuenta ficticia mapa E2E", ruc=f"MAP-{suffix}"
        )
        zone = Zona.objects.create(cliente=client, nombre="Zona ficticia mapa")
        CoberturaUsuario.objects.create(usuario=user, cliente=client, zona=zone)
        template = PlantillaChecklist.objects.create(nombre="Plantilla ficticia mapa")
        ItemPlantilla.objects.create(
            plantilla=template,
            descripcion="Inspección ficticia",
            foto_obligatoria=False,
        )
        Contrato.objects.create(
            cliente=client,
            plantilla_checklist=template,
            fecha_inicio=timezone.localdate().replace(day=1),
            frecuencia_visitas_mensual=2,
            radio_validacion_metros=100,
        )
        for index in range(2):
            store = Tienda.objects.create(
                cliente=client,
                zona=zone,
                nombre=f"Mapa E2E {suffix} tienda {index + 1}",
                direccion=f"Dirección ficticia {index + 1}, Distrito E2E, Lima",
                latitud=-12.1739 + index * 0.01,
                longitud=-77.0181 + index * 0.01,
            )
            stores.append(store.pk)
        generate_month(user)
        visits = list(
            Visita.objects.filter(tienda_id__in=stores)
            .order_by("tienda_id", "cuota")
            .values_list("pk", flat=True)
        )
    print(
        json.dumps({"username": user.username, "storeIds": stores, "visitIds": visits})
    )
