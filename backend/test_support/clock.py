import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.test_settings")
import django
django.setup()
from django.db import connection
from django.utils import timezone
from datetime import timedelta
from core.models import Visita
if os.environ["DJANGO_SETTINGS_MODULE"] != "config.test_settings" or connection.settings_dict["NAME"] != "nf_integration":
    raise RuntimeError("Reloj de pruebas permitido solo en base aislada.")
visit = Visita.objects.get(pk=int(sys.argv[1]), tienda__cliente__ruc="E2E-ONLY")
if sys.argv[2] == "work":
    if not visit.iniciado_en or visit.formulario_abierto_en:
        raise RuntimeError("El trabajo debe estar iniciado sin formulario.")
    visit.iniciado_en = timezone.now()-timedelta(minutes=8)
    visit.save(update_fields=["iniciado_en"])
elif sys.argv[2] == "expire":
    if not visit.formulario_abierto_en or visit.completado_en:
        raise RuntimeError("Se requiere un formulario abierto sin finalización.")
    visit.formulario_abierto_en = timezone.now()-timedelta(minutes=6)
    visit.formulario_vence_en = visit.formulario_abierto_en+timedelta(minutes=5)
    if visit.iniciado_en > visit.formulario_abierto_en:
        visit.iniciado_en = visit.formulario_abierto_en-timedelta(minutes=8)
    visit.save(update_fields=["iniciado_en", "formulario_abierto_en", "formulario_vence_en"])
elif sys.argv[2] == "expire_claim":
    if visit.origen != "checklist" or not visit.reclamada_en or visit.iniciado_en:
        raise RuntimeError("Se requiere un checklist reclamado y todavía sin iniciar.")
    visit.reclamada_en = timezone.now()-timedelta(hours=2, minutes=1)
    visit.reclamo_vence_en = visit.reclamada_en+timedelta(hours=2)
    visit.save(update_fields=["reclamada_en", "reclamo_vence_en"])
else:
    raise RuntimeError("Modo de reloj inválido.")
print("Timestamps adelantados solo para prueba de tiempo en PostgreSQL aislado.")
