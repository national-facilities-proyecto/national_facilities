"""Independent reporter/evidence scopes, only in the guarded local E2E seed."""

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
from core.models import AsignacionTienda, Rol, Tienda, Usuario  # noqa: E402
from core.tests import PASSWORD  # noqa: E402

if (
    os.environ["DJANGO_SETTINGS_MODULE"] != "config.test_settings"
    or connection.settings_dict["NAME"] != "nf_integration"
    or connection.settings_dict["HOST"] not in ("localhost", "127.0.0.1")
    or not Rol.objects.filter(nombre="E2E seed marker").exists()
):
    raise RuntimeError("Solo base E2E local aislada con seed ficticio.")

with transaction.atomic():
    store = Tienda.objects.get(cliente__ruc="E2E-ONLY", nombre="E2E isolated store")
    reporter = Usuario.objects.create_user(
        username=f"ticket-reporter-{uuid.uuid4().hex[:8]}",
        first_name="Supervisor tienda E2E",
        password=PASSWORD,
        rol=Rol.objects.get(nombre="Supervisor de tienda"),
        password_initialized=True,
    )
    AsignacionTienda.objects.create(usuario=reporter, tienda=store)
    print(json.dumps({"username": reporter.username}))
