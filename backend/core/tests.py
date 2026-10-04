import uuid
from io import BytesIO
from datetime import datetime, time, timedelta
from calendar import monthrange
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch
from PIL import Image
from django.db import connection, close_old_connections, IntegrityError, transaction
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from .models import (Rol, Usuario, Cliente, Tienda, AsignacionTienda, PlantillaChecklist, ItemPlantilla,
                     Contrato, Visita, Checklist, RespuestaItem, Evidencia, Ticket, CategoriaProblema, NivelUrgencia, ReasignacionTicket)
from .generation import generate_month


PASSWORD = "Field-test-secure-2026!"


def image_file():
    output = BytesIO()
    Image.new("RGB", (4, 4), color="blue").save(output, "JPEG")
    return SimpleUploadedFile("evidence.jpg", output.getvalue(), content_type="image/jpeg")


def fixtures():
    roles = {name: Rol.objects.create(nombre=name) for name in ["Tecnico", "Supervisor de cuenta", "Supervisor de tienda", "Administrador"]}
    users = {}
    for name, role in [("tech", "Tecnico"), ("othertech", "Tecnico"), ("account", "Supervisor de cuenta"), ("store", "Supervisor de tienda"), ("admin", "Administrador"), ("outsider", "Supervisor de cuenta")]:
        users[name] = Usuario.objects.create_user(username=name, email=f"{name}@test.invalid", password=PASSWORD,
            rol=roles[role], password_initialized=True)
    client = Cliente.objects.create(razon_social="Test client", ruc="TEST-1")
    store = Tienda.objects.create(cliente=client, nombre="Test store", direccion="Test address", latitud="-12.173900", longitud="-77.018100")
    for name in ["tech", "othertech", "account", "store"]:
        AsignacionTienda.objects.create(usuario=users[name], tienda=store)
    template = PlantillaChecklist.objects.create(nombre="Test template")
    item = ItemPlantilla.objects.create(plantilla=template, descripcion="Inspect device", foto_obligatoria=True)
    contract = Contrato.objects.create(cliente=client, plantilla_checklist=template,
        fecha_inicio=timezone.localdate().replace(day=1), radio_validacion_metros=100)
    category = CategoriaProblema.objects.create(nombre="Eléctrico")
    urgency = NivelUrgencia.objects.create(nombre="Alta", sla_primera_respuesta_horas=2, sla_resolucion_horas=24)
    return users, store, template, item, contract, category, urgency


class IntegrationTests(TestCase):
    def setUp(self):
        self.users, self.store, self.template, self.item, self.contract, self.category, self.urgency = fixtures()
        self.client = APIClient()
        self.login_as("tech")

    def login_as(self, name):
        self.client.force_authenticate(self.users[name])

    def post(self, path, data=None, key=None):
        payload = dict(data or {})
        if path.endswith("/revisar/") and payload.get("exceptionId"):
            from .models import Excepcion
            exception = Excepcion.objects.get(pk=payload["exceptionId"])
            payload.setdefault("revision", exception.visita.borrador_revision)
            payload.setdefault("exceptionRevision", exception.revision)
        return self.client.post("/api/"+path, payload, format="json", HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()))

    def gps(self):
        return {"latitude": float(self.store.latitud), "longitude": float(self.store.longitud),
                "accuracy": 8, "capturedAt": timezone.now().timestamp()*1000}

    def visit(self, origin="checklist"):
        if origin == "checklist":
            generate_month(self.users["tech"])
            return Visita.objects.get(origen="checklist")
        ticket = Ticket.objects.create(tienda=self.store, categoria=self.category, urgencia=self.urgency,
            reportado_por=self.users["store"], tecnico_asignado=self.users["tech"], estado="programado", descripcion="Reported issue")
        from .generation import snapshot
        visit = Visita(tienda=self.store, origen="ticket", tecnico=self.users["tech"], ticket_origen=ticket,
                       fecha_programada=timezone.now())
        snapshot(visit, self.contract)
        visit.save()
        return visit

    def start(self, visit):
        if visit.origen == "checklist":
            self.assertEqual(self.post(f"visitas/pool/{visit.pk}/tomar/").status_code, 200)
        return self.post(f"visitas/{visit.pk}/iniciar/", {"location": self.gps()})

    def open(self, visit):
        return self.post(f"visitas/{visit.pk}/formulario/", {"location": self.gps()})

    def upload(self, visit, evidence_id=None):
        data = {"id": evidence_id or str(uuid.uuid4()), "foto": image_file(), "source": "gallery",
                "capturedAt": timezone.now().isoformat(), "visitId": visit.pk}
        if visit.origen == "checklist":
            data["taskId"] = self.item.pk
        return self.client.post("/api/evidencias/", data, format="multipart")

    def draft(self, visit):
        response = self.upload(visit)
        self.assertEqual(response.status_code, 201, response.data)
        evidence_id = response.data["id"]
        draft = {"revision": 0, "answers": [], "workDescription": "", "evidenceIds": []}
        if visit.origen == "checklist":
            draft["answers"] = [{"taskId": self.item.pk, "result": "conforme", "observation": "", "evidenceIds": [evidence_id]}]
        else:
            draft.update(workDescription="Replaced valve and verified function", evidenceIds=[evidence_id])
        response = self.post(f"visitas/{visit.pk}/borrador/", draft)
        self.assertEqual(response.status_code, 200, response.data)
        return evidence_id, draft

    def test_postgresql_is_used(self):
        self.assertEqual(connection.vendor, "postgresql")
        self.assertEqual(self.post("checklists/generar/", {"period": "invalid"}).status_code, 400)
        self.assertEqual(self.post("checklists/generar/", {"period": "2020-01-01"}).status_code, 400)
        self.assertEqual(Visita.objects.count(), 0)

    def test_multiple_monthly_visits_are_independent_and_published_plan_is_preserved(self):
        self.contract.frecuencia_visitas_mensual = 3
        self.contract.save()
        ids = generate_month(self.users["tech"])
        self.assertEqual(len(ids), 3)
        self.assertEqual(list(Visita.objects.order_by("cuota").values_list("cuota", flat=True)), [1, 2, 3])
        for pk in ids:
            claimed = self.post(f"visitas/pool/{pk}/tomar/")
            self.assertEqual(claimed.status_code, 200, claimed.data)
            self.assertEqual(claimed.data["workStatus"], "pending")
            self.assertEqual(claimed.data["quotaCount"], 3)
        self.assertEqual(Visita.objects.filter(tecnico=self.users["tech"]).count(), 3)
        self.contract.frecuencia_visitas_mensual = 5
        self.contract.minimo_intervenciones_mensual = 5
        self.contract.save()
        self.assertEqual(generate_month(self.users["tech"]), ids)
        self.assertEqual(Visita.objects.count(), 3)
        visit = Visita.objects.get(pk=ids[1])
        self.start(visit)
        self.open(visit)
        self.draft(visit)
        self.assertEqual(self.post(f"visitas/{visit.pk}/finalizar/", {"location": self.gps()}).status_code, 200)
        self.assertEqual(Visita.objects.filter(estado="completada").count(), 1)
        self.login_as("account")
        dashboard = self.client.get("/api/dashboard/")
        self.assertAlmostEqual(dashboard.data["compliance"], 100/3)
        self.assertEqual(dashboard.data["pendingVisits"], 2)
        self.assertEqual(dashboard.data["risks"][0]["required"], 2)

    def test_contract_overlap_is_rejected_by_api_and_postgresql(self):
        self.contract.fecha_fin = self.contract.fecha_inicio+timedelta(days=10)
        self.contract.save()
        self.login_as("admin")
        body = {"clientId": self.store.cliente_id, "templateId": self.template.pk,
                "startDate": self.contract.fecha_fin.isoformat(), "endDate": None,
                "monthlyVisits": 1, "monthlyInterventions": 2, "radiusMeters": 100, "active": True}
        response = self.post("admin/contratos/", body)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("startDate", response.data)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Contrato.objects.create(cliente=self.store.cliente, plantilla_checklist=self.template,
                fecha_inicio=self.contract.fecha_fin, minimo_intervenciones_mensual=2)
        body["startDate"] = (self.contract.fecha_fin+timedelta(days=1)).isoformat()
        consecutive = self.post("admin/contratos/", body)
        self.assertEqual(consecutive.status_code, 201, consecutive.data)
        # Contratos distintos del mismo mes, sin fechas simultáneas, son válidos.
        self.login_as("tech")
        self.assertEqual(self.post("checklists/generar/").status_code, 200)
        self.assertEqual(Visita.objects.filter(tienda=self.store, origen="checklist").count(), 1)
        self.login_as("admin")
        response = self.client.patch(f"/api/admin/contratos/{consecutive.data['id']}/",
            {"startDate": self.contract.fecha_fin.isoformat()}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get("/api/dashboard/").status_code, 403)

    def test_ticket_minimum_is_separate_for_each_store_and_excludes_checklists(self):
        second_store = Tienda.objects.create(cliente=self.store.cliente, nombre="Second store", direccion="Address", latitud="-12", longitud="-77")
        for user in (self.users["tech"], self.users["account"]):
            AsignacionTienda.objects.create(usuario=user, tienda=second_store)
        generate_month(self.users["tech"])
        checklist = Visita.objects.get(origen="checklist", tienda=self.store)
        self.start(checklist)
        self.open(checklist)
        self.draft(checklist)
        self.assertEqual(self.post(f"visitas/{checklist.pk}/finalizar/", {"location": self.gps()}).status_code, 200)
        self.login_as("account")
        initial = self.client.get("/api/dashboard/")
        self.assertTrue(all(row["completed"] == 0 for row in initial.data["risks"]))
        self.login_as("tech")
        for index in range(3):
            visit = self.visit("ticket")
            if index == 1:
                # Un ticket reportado antes de este mes y atendido ahora sí cuenta.
                Ticket.objects.filter(pk=visit.ticket_origen_id).update(creado_en=timezone.now()-timedelta(days=40))
            self.start(visit)
            self.open(visit)
            self.draft(visit)
            if index < 2:
                self.assertEqual(self.post(f"visitas/{visit.pk}/finalizar/", {"location": self.gps()}).status_code, 200)
            else:
                visit.refresh_from_db()
                visit.iniciado_en = timezone.now()-timedelta(minutes=10)
                visit.formulario_abierto_en = timezone.now()-timedelta(minutes=6)
                visit.formulario_vence_en = visit.formulario_abierto_en+timedelta(minutes=5)
                visit.save()
                self.assertEqual(self.post(f"visitas/{visit.pk}/excepciones/", {"type": "time_limit", "reason": "Connection failure during registration"}).status_code, 200)
        self.login_as("account")
        dashboard = self.client.get("/api/dashboard/")
        self.assertEqual(dashboard.status_code, 200, dashboard.data)
        metrics = {row["storeId"]: row for row in dashboard.data["risks"]}
        self.assertEqual((metrics[self.store.pk]["completed"], metrics[self.store.pk]["required"], metrics[self.store.pk]["missing"]), (2, 2, 0))
        self.assertEqual((metrics[second_store.pk]["completed"], metrics[second_store.pk]["required"], metrics[second_store.pk]["missing"]), (0, 2, 2))
        self.assertIsNone(dashboard.data["sla"])

    def test_checklist_can_start_any_day_of_its_month_and_not_after_month_end(self):
        self.contract.frecuencia_visitas_mensual = 2
        self.contract.save()
        ids = generate_month(self.users["tech"])
        period = timezone.localdate().replace(day=1)
        last = period.replace(day=monthrange(period.year, period.month)[1])
        end_of_month = timezone.make_aware(datetime.combine(last, time(23, 30)))
        with patch("core.services.timezone.now", return_value=end_of_month):
            first = Visita.objects.get(pk=ids[0])
            self.assertEqual(self.start(first).status_code, 200)
            first.refresh_from_db()
            self.assertEqual(timezone.localdate(first.iniciado_en), last)
            self.assertEqual(timezone.localdate(first.fecha_programada), period)
            self.assertIsNone(first.formulario_abierto_en)
            self.assertEqual(self.post(f"visitas/pool/{ids[1]}/tomar/").status_code, 200)
        # Una reserva de dos horas no autoriza iniciar una obligación del mes anterior.
        next_month = end_of_month+timedelta(hours=1)
        with patch("core.services.timezone.now", return_value=next_month):
            self.assertEqual(self.post(f"visitas/{ids[1]}/iniciar/", {"location": self.gps()}).status_code, 409)
            self.assertEqual(self.post(f"visitas/pool/{ids[1]}/tomar/").status_code, 409)
            # La ejecución que ya inició sí conserva continuidad y sus horas reales.
            self.assertEqual(self.post(f"visitas/{ids[0]}/iniciar/", {"location": self.gps()}).status_code, 200)
            self.assertEqual(self.open(first).status_code, 200)
        second = Visita.objects.get(pk=ids[1])
        self.assertIsNone(second.iniciado_en)
        self.assertIsNone(second.formulario_abierto_en)

    def test_contract_minimum_is_at_least_two_per_store(self):
        self.login_as("admin")
        body = {"clientId": self.store.cliente_id, "templateId": self.template.pk,
                "startDate": (timezone.localdate()+timedelta(days=365)).isoformat(), "endDate": None,
                "monthlyVisits": 1, "monthlyInterventions": 1, "radiusMeters": 100, "active": True}
        response = self.post("admin/contratos/", body)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("monthlyInterventions", response.data)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Contrato.objects.filter(pk=self.contract.pk).update(minimo_intervenciones_mensual=1)

    def test_native_admin_cannot_bypass_execution_or_password_rules(self):
        from .admin import inspection_site
        from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
        from django.test import RequestFactory
        request = RequestFactory().get("/admin/")
        request.user = self.users["admin"]
        request.user.is_staff = True
        for model in (Usuario, Visita, Ticket, Evidencia):
            model_admin = inspection_site._registry[model]
            self.assertTrue(model_admin.has_view_permission(request))
            self.assertFalse(model_admin.has_add_permission(request))
            self.assertFalse(model_admin.has_change_permission(request))
            self.assertFalse(model_admin.has_delete_permission(request))
        request.user.password_initialized = False
        self.assertFalse(inspection_site.has_permission(request))
        self.assertFalse(inspection_site._registry[Visita].has_view_permission(request))
        with self.assertRaises(DjangoPermissionDenied):
            inspection_site.password_change(request)

    def test_unstarted_claim_expires_and_is_released_once_with_history(self):
        visit = self.visit()
        first = self.post(f"visitas/pool/{visit.pk}/tomar/")
        repeated = self.post(f"visitas/pool/{visit.pk}/tomar/")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data["claimExpiresAt"], repeated.data["claimExpiresAt"])
        self.assertEqual(visit.eventos.filter(tipo="claim").count(), 1)
        visit.refresh_from_db()
        self.assertEqual(visit.reclamo_vence_en-visit.reclamada_en, timedelta(hours=2))
        visit.reclamada_en = timezone.now()-timedelta(hours=2, seconds=1)
        visit.reclamo_vence_en = visit.reclamada_en+timedelta(hours=2)
        visit.save()
        stale = self.post(f"visitas/{visit.pk}/iniciar/", {"location": self.gps()})
        self.assertEqual(stale.status_code, 403, stale.data)
        visit.refresh_from_db()
        self.assertIsNone(visit.tecnico_id)
        self.assertIsNone(visit.iniciado_en)
        self.assertIsNone(visit.formulario_vence_en)
        for _ in range(2):
            pool = self.client.get("/api/visitas/pool/")
            self.assertEqual(pool.status_code, 200)
            self.assertEqual([v["id"] for v in pool.data], [visit.pk])
        release = visit.eventos.get(tipo="claim_release")
        self.assertIsNone(release.actor_id)
        self.assertEqual(release.datos["technicianId"], self.users["tech"].pk)
        self.assertEqual(release.datos["reason"], "unstarted_claim_timeout")
        self.login_as("othertech")
        reclaimed = self.post(f"visitas/pool/{visit.pk}/tomar/")
        self.assertEqual(reclaimed.status_code, 200)
        self.assertEqual([h["kind"] for h in reclaimed.data["claimHistory"]], ["claim", "claim_release", "claim"])
        self.assertEqual(self.post(f"visitas/{visit.pk}/iniciar/", {"location": self.gps()}).status_code, 200)
        self.login_as("tech")
        self.assertEqual(self.post(f"visitas/{visit.pk}/iniciar/", {"location": self.gps()}).status_code, 404)

    def test_claim_release_boundary_scope_and_database_constraints(self):
        from .claims import release_expired_claims
        visit = self.visit()
        self.post(f"visitas/pool/{visit.pk}/tomar/")
        visit.refresh_from_db()
        deadline = visit.reclamo_vence_en
        with patch("core.claims.timezone.now", return_value=deadline-timedelta(microseconds=1)):
            self.assertEqual(release_expired_claims(), 0)
        with patch("core.claims.timezone.now", return_value=deadline):
            self.login_as("outsider")
            self.assertEqual(self.client.get("/api/visitas/").data, [])
            visit.refresh_from_db()
            self.assertIsNotNone(visit.tecnico_id)
            self.assertEqual(release_expired_claims(), 1)
            self.assertEqual(release_expired_claims(), 0)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Visita.objects.filter(pk=visit.pk).update(reclamada_en=timezone.now())
        from .models import Evento
        with self.assertRaises(IntegrityError), transaction.atomic():
            Evento.objects.create(visita=visit, tipo="start", texto="Sin actor")

    def test_started_execution_never_expires_with_claim_reservation(self):
        from .claims import release_expired_claims
        visit = self.visit()
        self.assertEqual(self.start(visit).status_code, 200)
        visit.refresh_from_db()
        visit.reclamada_en = timezone.now()-timedelta(hours=3)
        visit.reclamo_vence_en = visit.reclamada_en+timedelta(hours=2)
        visit.save()
        original_start = visit.iniciado_en
        self.assertEqual(release_expired_claims(), 0)
        self.assertEqual(self.start(visit).status_code, 200)
        visit.refresh_from_db()
        self.assertEqual(visit.iniciado_en, original_start)
        self.assertEqual(visit.tecnico_id, self.users["tech"].pk)
        self.assertIsNone(visit.formulario_vence_en)
        self.assertEqual(self.open(visit).status_code, 200)
        visit.refresh_from_db()
        self.assertEqual(visit.formulario_vence_en-visit.formulario_abierto_en, timedelta(minutes=5))

    def test_claim_expiring_during_gps_validation_cannot_start(self):
        from .services import start_visit, Conflict
        visit = self.visit()
        self.post(f"visitas/pool/{visit.pk}/tomar/")
        visit.refresh_from_db()
        clock = {"now": visit.reclamo_vence_en-timedelta(seconds=1)}
        def gps_crossing_deadline(*args):
            clock["now"] = visit.reclamo_vence_en
            return self.gps()
        with patch("core.services.timezone.now", side_effect=lambda: clock["now"]), \
             patch("core.services.validate_gps", side_effect=gps_crossing_deadline):
            with self.assertRaises(Conflict), transaction.atomic():
                start_visit(self.users["tech"], visit.pk, {"location": {}})
        visit.refresh_from_db()
        self.assertIsNone(visit.iniciado_en)
        self.assertEqual(visit.estado, "programada")

    def test_historical_claim_without_recorded_time_is_preserved_for_review(self):
        from .claims import release_expired_claims
        visit = self.visit()
        visit.tecnico = self.users["tech"]
        visit.save()
        self.assertEqual(release_expired_claims(), 0)
        self.assertEqual(self.post(f"visitas/pool/{visit.pk}/tomar/").status_code, 409)
        self.assertEqual(self.post(f"visitas/{visit.pk}/iniciar/", {"location": self.gps()}).status_code, 409)
        visit.refresh_from_db()
        self.assertEqual(visit.tecnico_id, self.users["tech"].pk)
        self.assertIsNone(visit.reclamada_en)
        self.assertIsNone(visit.iniciado_en)
        self.assertEqual(visit.eventos.count(), 0)

    def test_two_stages_and_recovery_for_both_origins(self):
        for origin in ("checklist", "ticket"):
            with self.subTest(origin=origin):
                visit = self.visit(origin)
                response = self.start(visit)
                self.assertEqual(response.status_code, 200, response.data)
                self.assertIsNone(response.data["formOpenedAt"])
                self.assertIsNone(response.data["expiresAt"])
                original_start = timezone.now()-timedelta(minutes=8)
                Visita.objects.filter(pk=visit.pk).update(iniciado_en=original_start)
                opened = self.open(visit)
                self.assertEqual(opened.status_code, 200, opened.data)
                visit.refresh_from_db()
                self.assertEqual(visit.formulario_vence_en-visit.formulario_abierto_en, timedelta(minutes=5))
                repeated = self.open(visit)
                self.assertEqual(repeated.data["expiresAt"], opened.data["expiresAt"])
                evidence_id, draft = self.draft(visit)
                other_session = APIClient()
                other_session.force_authenticate(self.users["tech"])
                recovered = other_session.get(f"/api/visitas/{visit.pk}/")
                self.assertEqual(recovered.status_code, 200)
                self.assertEqual(recovered.data["expiresAt"], opened.data["expiresAt"])
                self.assertEqual(recovered.data["revision"], 1)
                self.assertEqual(other_session.get(f"/api/evidencias/{evidence_id}/archivo/").status_code, 200)
                key = str(uuid.uuid4())
                body = {"location": self.gps()}
                complete = self.post(f"visitas/{visit.pk}/finalizar/", body, key)
                self.assertEqual(complete.status_code, 200, complete.data)
                replay = self.post(f"visitas/{visit.pk}/finalizar/", body, key)
                self.assertEqual(replay.data["completedAt"], complete.data["completedAt"])
                self.assertGreater(complete.data["totalSeconds"], 7*60)
                self.assertGreater(complete.data["executionSeconds"], 7*60)
                self.assertLess(complete.data["registrationSeconds"], 300)
                self.assertEqual(self.start(visit).status_code, 409)
                self.assertEqual(self.open(visit).status_code, 409)
                if origin == "ticket":
                    visit.ticket_origen.refresh_from_db()
                    self.assertEqual(visit.ticket_origen.estado, "resuelto")

    def test_autosave_cas_and_idempotent_retry(self):
        visit = self.visit()
        self.start(visit)
        self.open(visit)
        _, draft = self.draft(visit)
        draft["revision"] = 1
        draft["answers"][0].update(result="no_conforme", observation="Observed damaged insulation")
        key = str(uuid.uuid4())
        response = self.post(f"visitas/{visit.pk}/borrador/", draft, key)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.post(f"visitas/{visit.pk}/borrador/", draft, key).data["revision"], 2)
        self.assertEqual(self.post(f"visitas/{visit.pk}/borrador/", draft).status_code, 409)
        self.assertEqual(RespuestaItem.objects.count(), 1)
        self.assertEqual(RespuestaItem.objects.get().observacion, "Observed damaged insulation")
        changed = {**draft, "workDescription": "Different body"}
        self.assertEqual(self.post(f"visitas/{visit.pk}/borrador/", changed, key).status_code, 409)

    def test_expiration_justification_no_reset_and_incomplete_review(self):
        for origin in ("checklist", "ticket"):
            visit = self.visit(origin)
            self.start(visit)
            self.open(visit)
            deadline = timezone.now()-timedelta(seconds=1)
            opened = deadline - timedelta(minutes=5)
            Visita.objects.filter(pk=visit.pk).update(iniciado_en=opened-timedelta(minutes=8), formulario_abierto_en=opened, formulario_vence_en=deadline)
            self.assertEqual(self.post(f"visitas/{visit.pk}/finalizar/", {"location": self.gps()}).status_code, 409)
            response = self.post(f"visitas/{visit.pk}/excepciones/", {"type": "time_limit", "reason": "Phone powered off during registration"})
            self.assertEqual(response.status_code, 200, response.data)
            visit.refresh_from_db()
            self.assertEqual(visit.formulario_vence_en, deadline)
            self.assertIsNone(visit.completado_en)
            self.assertEqual(visit.estado, "pendiente_validacion")
            self.login_as("account")
            exception_id = response.data["exceptions"][0]["id"]
            reviewed = self.post(f"visitas/{visit.pk}/revisar/", {"exceptionId": exception_id, "approved": True, "reason": "Reviewed loss of connection"})
            self.assertEqual(reviewed.status_code, 400)
            self.assertEqual(visit.excepciones.get().decision, "pending")
            self.login_as("tech")

    def test_expired_incomplete_registration_can_be_completed_rejected_corrected_and_approved(self):
        for origin in ("checklist", "ticket"):
            visit = self.visit(origin)
            self.start(visit)
            self.open(visit)
            opened = timezone.now()-timedelta(minutes=6)
            deadline = opened+timedelta(minutes=5)
            Visita.objects.filter(pk=visit.pk).update(iniciado_en=opened-timedelta(minutes=8),
                formulario_abierto_en=opened, formulario_vence_en=deadline)
            response = self.client.get(f"/api/visitas/{visit.pk}/")
            self.assertEqual(response.data["workStatus"], "in_progress")
            reason = "Phone lost connection during registration"
            requested = self.post(f"visitas/{visit.pk}/excepciones/", {"type": "time_limit", "reason": reason})
            self.assertEqual(requested.data["workStatus"], "in_review")
            self.assertIsNone(requested.data["submittedAt"])
            exception = requested.data["exceptions"][0]
            self.login_as("account")
            rejected = self.post(f"visitas/{visit.pk}/revisar/", {"exceptionId": exception["id"], "approved": False,
                "reason": "Explain the connectivity failure in more detail"})
            self.assertEqual(rejected.status_code, 200, rejected.data)
            self.assertEqual(rejected.data["workStatus"], "in_review")
            self.login_as("tech")
            evidence_id, draft = self.draft(visit)
            visit.refresh_from_db()
            body = {"revision": visit.borrador_revision, "location": self.gps(), "exceptions": [{"type": "time_limit",
                "reason": "Network outage prevented uploading photographs on time", "revision": exception["revision"]}]}
            key = str(uuid.uuid4())
            submitted = self.post(f"visitas/{visit.pk}/enviar-revision/", body, key)
            self.assertEqual(submitted.status_code, 200, submitted.data)
            self.assertEqual(self.post(f"visitas/{visit.pk}/enviar-revision/", body, key).status_code, 200)
            self.assertEqual(visit.eventos.filter(tipo="review_submission").count(), 1)
            self.assertEqual(submitted.data["expiresAt"], deadline.isoformat())
            self.assertEqual(visit.excepciones.count(), 1)
            self.assertEqual(Evidencia.objects.filter(visita=visit).count(), 1)
            self.assertEqual(self.post(f"visitas/{visit.pk}/borrador/", {**draft, "revision": visit.borrador_revision}).status_code, 409)
            self.login_as("account")
            review = {"exceptionId": exception["id"], "approved": True, "reason": "Verified corrected content and justification"}
            self.assertEqual(self.post(f"visitas/{visit.pk}/revisar/", {**review, "revision": 0}).status_code, 409)
            self.assertEqual(self.post(f"visitas/{visit.pk}/revisar/", {**review, "exceptionRevision": 0}).status_code, 409)
            approved = self.post(f"visitas/{visit.pk}/revisar/", review)
            self.assertEqual(approved.status_code, 200, approved.data)
            self.assertEqual(approved.data["workStatus"], "finished")
            decisions = [e["exception"] for e in approved.data["exceptionHistory"] if e["kind"] == "review"]
            self.assertEqual([e["approved"] for e in decisions], [False, True])
            self.assertEqual(decisions[0]["reason"], reason)
            self.assertNotEqual(decisions[0]["reason"], decisions[1]["reason"])
            if origin == "ticket":
                visit.ticket_origen.refresh_from_db()
                from .serializers import ticket_data
                self.assertEqual(ticket_data(visit.ticket_origen)["workStatus"], "finished")
                self.login_as("store")
                closed = self.post(f"tickets/{visit.ticket_origen_id}/cerrar/")
                self.assertEqual(closed.status_code, 200, closed.data)
                self.assertEqual(closed.data["workStatus"], "finished")
                visit.ticket_origen.refresh_from_db()
                self.assertEqual(visit.ticket_origen.estado, "resuelto")
                self.assertIsNone(visit.ticket_origen.cerrado_en)
            self.login_as("tech")

    def test_correction_reopens_prior_approval_without_losing_time_or_gps_history(self):
        visit = self.visit()
        self.start(visit)
        self.open(visit)
        evidence_id, draft = self.draft(visit)
        gps = self.post(f"visitas/{visit.pk}/excepciones/", {"type": "location", "failure": "denied", "reason": "GPS permission unavailable on device"})
        opened = timezone.now()-timedelta(minutes=6)
        Visita.objects.filter(pk=visit.pk).update(iniciado_en=opened-timedelta(minutes=8),
            formulario_abierto_en=opened, formulario_vence_en=opened+timedelta(minutes=5))
        timed = self.post(f"visitas/{visit.pk}/excepciones/", {"type": "time_limit", "reason": "Session expired during image upload"})
        self.login_as("account")
        self.post(f"visitas/{visit.pk}/revisar/", {"exceptionId": gps.data["exceptions"][0]["id"], "approved": True,
            "reason": "Confirmed unavailable GPS with evidence"})
        rejected = self.post(f"visitas/{visit.pk}/revisar/", {"exceptionId": timed.data["exceptions"][-1]["id"], "approved": False,
            "reason": "Describe the technical observation more precisely"})
        self.assertEqual(rejected.status_code, 200, rejected.data)
        self.login_as("tech")
        corrected = self.post(f"visitas/{visit.pk}/borrador/", {**draft, "revision": 1,
            "answers": [{"taskId": self.item.pk, "result": "no_conforme", "observation": "Insulation needs replacement", "evidenceIds": [evidence_id]}]})
        self.assertEqual(corrected.status_code, 200, corrected.data)
        self.assertIsNone(corrected.data["submittedAt"])
        self.assertEqual(corrected.data["exceptions"][0]["approved"], None)
        self.assertEqual(corrected.data["exceptions"][1]["approved"], False)
        body = {"revision": corrected.data["revision"], "exceptions": [
            {"type": e["type"], "reason": e["reason"], "failure": e["failure"], "revision": e["revision"]}
            for e in corrected.data["exceptions"]]}
        invalid = self.post(f"visitas/{visit.pk}/enviar-revision/", {**body, "location": {**self.gps(), "latitude": 91}})
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(visit.excepciones.get(tipo="time_limit").decision, "rejected")
        submitted = self.post(f"visitas/{visit.pk}/enviar-revision/", body)
        self.assertEqual(submitted.status_code, 200, submitted.data)
        self.login_as("account")
        first = self.post(f"visitas/{visit.pk}/revisar/", {"exceptionId": timed.data["exceptions"][-1]["id"], "approved": True,
            "reason": "Reviewed complete corrected description"})
        self.assertEqual(first.data["workStatus"], "in_review")
        last = self.post(f"visitas/{visit.pk}/revisar/", {"exceptionId": gps.data["exceptions"][0]["id"], "approved": True,
            "reason": "Reviewed GPS exception for corrected record"})
        self.assertEqual(last.data["workStatus"], "finished")
        self.assertEqual(len(last.data["exceptions"]), 2)
        self.assertEqual(visit.eventos.filter(tipo="review").count(), 4)
        self.assertTrue(any(e["kind"] == "exception_reopened" for e in last.data["exceptionHistory"]))

    def test_gps_validation_and_content(self):
        visit = self.visit()
        self.post(f"visitas/pool/{visit.pk}/tomar/")
        for gps in [
            {**self.gps(), "latitude": 91},
            {**self.gps(), "longitude": 181},
            {**self.gps(), "accuracy": -1},
            {**self.gps(), "accuracy": 101},
            {**self.gps(), "capturedAt": 0},
            {**self.gps(), "latitude": 0},
            {**self.gps(), "latitude": "12"},
        ]:
            self.assertEqual(self.post(f"visitas/{visit.pk}/iniciar/", {"location": gps}).status_code, 400)
        self.assertEqual(self.start(visit).status_code, 200)
        self.assertEqual(self.post(f"visitas/{visit.pk}/finalizar/", {"location": self.gps()}).status_code, 409)
        self.open(visit)
        self.assertEqual(self.post(f"visitas/{visit.pk}/finalizar/", {"location": self.gps()}).status_code, 400)

    def test_deadline_is_enforced_at_acceptance_for_both_origins(self):
        from .services import validate_gps
        for origin in ("checklist", "ticket"):
            visit = self.visit(origin)
            self.start(visit)
            self.open(visit)
            self.draft(visit)
            visit.refresh_from_db()
            deadline = visit.formulario_vence_en
            with patch("core.services.timezone.now", return_value=deadline):
                self.assertEqual(self.post(f"visitas/{visit.pk}/finalizar/", {"location": self.gps()}).status_code, 409)
            clock = [deadline-timedelta(seconds=1)]
            def validate_then_expire(data, current):
                location = validate_gps(data, current)
                clock[0] = deadline
                return location
            with patch("core.services.timezone.now", side_effect=lambda: clock[0]), patch("core.services.validate_gps", side_effect=validate_then_expire):
                self.assertEqual(self.post(f"visitas/{visit.pk}/finalizar/", {"location": self.gps()}).status_code, 409)
            visit.refresh_from_db()
            self.assertIsNone(visit.enviado_en)
            self.assertIsNone(visit.completado_en)

    def test_foreign_resource_permissions(self):
        visit = self.visit()
        self.start(visit)
        self.open(visit)
        evidence_id, _ = self.draft(visit)
        self.login_as("othertech")
        self.assertEqual(self.client.get(f"/api/visitas/{visit.pk}/").status_code, 404)
        self.assertEqual(self.post(f"visitas/{visit.pk}/formulario/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/evidencias/{evidence_id}/archivo/").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/evidencias/{evidence_id}/").status_code, 404)
        self.assertEqual(self.post("admin/clientes/", {"name": "x"}).status_code, 403)
        self.login_as("outsider")
        self.assertEqual(self.client.get(f"/api/visitas/{visit.pk}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/evidencias/{evidence_id}/").status_code, 404)
        self.login_as("account")
        self.assertEqual(self.client.get(f"/api/evidencias/{evidence_id}/archivo/").status_code, 200)

    def test_upload_validation_retry_and_closed_protection(self):
        visit = self.visit()
        self.start(visit)
        self.open(visit)
        evidence_id = str(uuid.uuid4())
        self.assertEqual(self.upload(visit, evidence_id).status_code, 201)
        self.assertEqual(self.upload(visit, evidence_id).status_code, 200)
        self.assertEqual(Evidencia.objects.count(), 1)
        invalid = {"id": str(uuid.uuid4()), "foto": SimpleUploadedFile("file.jpg", b"not an image", content_type="image/jpeg"),
                   "source": "gallery", "capturedAt": timezone.now().isoformat(), "visitId": visit.pk, "taskId": self.item.pk}
        self.assertEqual(self.client.post("/api/evidencias/", invalid, format="multipart").status_code, 400)
        self.post(f"visitas/{visit.pk}/borrador/", {"revision": 0, "answers": [{"taskId": self.item.pk, "result": "conforme", "observation": "", "evidenceIds": [evidence_id]}], "workDescription": "", "evidenceIds": []})
        self.post(f"visitas/{visit.pk}/finalizar/", {"location": self.gps()})
        self.assertEqual(self.client.delete(f"/api/evidencias/{evidence_id}/").status_code, 409)
        self.assertEqual(self.upload(visit).status_code, 409)
        # Una evidencia histórica puede estar asociada solo mediante checklist.
        Evidencia.objects.filter(client_id=evidence_id).update(visita=None)
        self.assertEqual(self.client.delete(f"/api/evidencias/{evidence_id}/").status_code, 409)
        Evidencia.objects.filter(client_id=evidence_id).update(foto="missing-test-file.jpg")
        self.assertEqual(self.client.get(f"/api/evidencias/{evidence_id}/archivo/").status_code, 404)

    def test_ticket_creation_scheduling_reassignment(self):
        self.login_as("store")
        file_id = str(uuid.uuid4())
        temporary = self.client.post("/api/evidencias/", {"id": file_id, "foto": image_file(), "source": "upload"}, format="multipart")
        self.assertEqual(temporary.status_code, 201)
        self.assertEqual(self.client.get("/api/evidencias/").data[0]["id"], file_id)
        body = {"storeId": self.store.pk, "categoryId": self.category.pk, "priorityId": self.urgency.pk,
                "description": "Broken refrigeration unit needs maintenance", "evidenceIds": [file_id]}
        key = str(uuid.uuid4())
        ticket_response = self.post("tickets/", body, key)
        self.assertEqual(ticket_response.status_code, 201, ticket_response.data)
        self.assertEqual(self.post("tickets/", body, key).data["id"], ticket_response.data["id"])
        self.assertEqual(Ticket.objects.count(), 1)
        self.assertEqual(self.client.get("/api/evidencias/").data, [])
        self.login_as("account")
        self.assertEqual(self.client.get("/api/evidencias/").status_code, 403)
        pk = ticket_response.data["id"]
        scheduled = {"technicianId": self.users["tech"].pk, "scheduledAt": (timezone.now()+timedelta(hours=1)).isoformat(), "priorityId": self.urgency.pk, "reason": "", "revision": 0}
        first = self.post(f"tickets/{pk}/programar/", scheduled)
        self.assertEqual(first.status_code, 200, first.data)
        old_visit = first.data["visitId"]
        scheduled.update(technicianId=self.users["othertech"].pk, revision=1, reason="Technician availability changed")
        second = self.post(f"tickets/{pk}/programar/", scheduled)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(Visita.objects.filter(ticket_origen_id=pk, vigente=True).count(), 1)
        self.assertEqual(len(second.data["history"]), 4)
        self.login_as("tech")
        self.assertEqual(self.client.get(f"/api/visitas/{old_visit}/").status_code, 404)
        self.assertEqual(self.post(f"visitas/{old_visit}/iniciar/", {"location": self.gps()}).status_code, 404)
        self.login_as("othertech")
        current = Visita.objects.get(pk=second.data["visitId"])
        self.assertEqual(self.start(current).status_code, 200)
        self.login_as("account")
        scheduled.update(technicianId=self.users["tech"].pk, revision=2)
        for state in ("en_proceso", "pendiente_validacion", "resuelto", "cerrado"):
            Ticket.objects.filter(pk=pk).update(estado=state)
            denied = self.post(f"tickets/{pk}/programar/", scheduled)
            self.assertEqual(denied.status_code, 409, denied.data)
            self.assertEqual(Visita.objects.filter(ticket_origen_id=pk, vigente=True).count(), 1)
            current.refresh_from_db()
            self.assertEqual(current.tecnico_id, self.users["othertech"].pk)
        self.assertEqual(ReasignacionTicket.objects.filter(ticket_id=pk).count(), 2)

    def test_client_legal_name_is_validated_and_persistent(self):
        self.login_as("admin")
        payload = {"name": "Legal company name", "taxId": "CLIENT-LEGAL", "email": "contact@test.invalid"}
        created = self.post("admin/clientes/", payload)
        self.assertEqual(created.status_code, 201, created.data)
        pk = created.data["id"]
        path = f"/api/admin/clientes/{pk}/"
        def edit_client(data):
            return self.client.patch(path, data, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
        self.assertEqual(set(created.data), {"id", "name", "taxId", "email"})
        self.assertEqual(self.client.get(path).data["name"], payload["name"])
        changed = edit_client({"name": "Updated legal company name"})
        self.assertEqual(changed.status_code, 200, changed.data)
        record = Cliente.objects.get(pk=pk)
        self.assertEqual(record.razon_social, "Updated legal company name")
        self.assertEqual(edit_client({"email": "other@test.invalid"}).data["name"], record.razon_social)
        for invalid in ("x" * 201, None, {}, ""):
            rejected = edit_client({"name": invalid})
            self.assertEqual(rejected.status_code, 400, rejected.data)
            self.assertIn("name", rejected.data)
            self.assertEqual(Cliente.objects.get(pk=pk).razon_social, record.razon_social)
        without_email = self.post("admin/clientes/", {"name": "Another legal company name", "taxId": "CLIENT-NO-EMAIL", "email": ""})
        self.assertEqual(without_email.status_code, 201, without_email.data)
        self.assertEqual(set(without_email.data), {"id", "name", "taxId", "email"})
        self.login_as("store")
        self.assertEqual(edit_client({"name": "Not authorized"}).status_code, 403)

    def test_admin_credentials_assignments_and_template_snapshot(self):
        visit = self.visit()
        original = visit.checklist.tareas_snapshot
        self.login_as("admin")
        payload = {"username": "newtech", "name": "New Technician", "email": "newtech@test.invalid",
                   "role": "technician", "active": True, "storeIds": [self.store.pk], "password": PASSWORD}
        response = self.post("admin/usuarios/", payload)
        self.assertEqual(response.status_code, 201, response.data)
        user = Usuario.objects.get(pk=response.data["id"])
        self.assertTrue(user.check_password(PASSWORD))
        self.assertFalse(user.password_initialized)
        self.assertTrue(AsignacionTienda.objects.filter(usuario=user, tienda=self.store, activo=True).exists())
        payload["username"] = "weakuser"
        payload["password"] = "12345678"
        self.assertEqual(self.post("admin/usuarios/", payload).status_code, 400)
        template = {"name": "Updated template", "active": True, "version": 2, "tasks": [{"id": self.item.pk, "title": "Changed task title", "photoRequired": False, "active": True, "order": 1}]}
        response = self.client.put(f"/api/admin/plantillas/{self.template.pk}/", template, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
        self.assertEqual(response.status_code, 200, response.data)
        visit.checklist.refresh_from_db()
        self.assertEqual(visit.checklist.tareas_snapshot, original)
        self.assertEqual(self.client.delete(f"/api/admin/plantillas/{self.template.pk}/").status_code, 409)

    def test_auth_password_setup_refresh_and_logout(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post("/api/auth/login/", [], format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/auth/refresh/", {"refresh": {}}, format="json").status_code, 400)
        self.users["tech"].password_initialized = False
        self.users["tech"].save()
        response = self.client.post("/api/auth/login/", {"username": "tech", "password": PASSWORD}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["role"], "technician")
        self.client.credentials(HTTP_AUTHORIZATION="Bearer "+response.data["access"])
        self.assertEqual(self.client.get("/api/checklists/").status_code, 403)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 200)
        self.assertEqual(self.client.post("/api/auth/password/", {"password": {}, "confirmation": {}}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/auth/password/", {"password": "12345678", "confirmation": "12345678"}, format="json").status_code, 400)
        changed = self.client.post("/api/auth/password/", {"password": "Stronger-than-first-2026!", "confirmation": "Stronger-than-first-2026!"}, format="json")
        self.assertEqual(changed.status_code, 200, changed.data)
        old_refresh = changed.data["refresh"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer "+changed.data["access"])
        refreshed = self.client.post("/api/auth/refresh/", {"refresh": old_refresh}, format="json")
        self.assertEqual(refreshed.status_code, 200)
        self.assertEqual(self.client.post("/api/auth/refresh/", {"refresh": old_refresh}, format="json").status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer "+refreshed.data["access"])
        self.assertEqual(self.client.post("/api/auth/logout/", {}, format="json").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)


    def test_time_and_gps_exceptions_are_independent(self):
        for origin in ("checklist", "ticket"):
            visit = self.visit(origin)
            self.start(visit)
            self.post(f"visitas/{visit.pk}/formulario/", {"failure": "unavailable"})
            self.draft(visit)
            gps = self.post(f"visitas/{visit.pk}/excepciones/", {"type": "location", "failure": "denied", "reason": "GPS permission unavailable on device"})
            self.assertEqual(gps.status_code, 200)
            opened = timezone.now()-timedelta(minutes=6)
            Visita.objects.filter(pk=visit.pk).update(iniciado_en=opened-timedelta(minutes=8), formulario_abierto_en=opened, formulario_vence_en=opened+timedelta(minutes=5))
            timed = self.post(f"visitas/{visit.pk}/excepciones/", {"type": "time_limit", "reason": "Recovered after session expiration"})
            self.assertEqual(timed.status_code, 200)
            self.assertEqual(len(timed.data["exceptions"]), 2)
            self.login_as("account")
            body = {"exceptionId": gps.data["exceptions"][0]["id"], "approved": True, "reason": "Reviewed complete content and GPS issue"}
            first = self.post(f"visitas/{visit.pk}/revisar/", body)
            self.assertEqual(first.status_code, 200, first.data)
            self.assertEqual(first.data["status"], "pending_approval")
            self.assertEqual(self.post(f"visitas/{visit.pk}/revisar/", body).status_code, 200)
            body["exceptionId"] = timed.data["exceptions"][-1]["id"]
            second = self.post(f"visitas/{visit.pk}/revisar/", body)
            self.assertEqual(second.status_code, 200, second.data)
            self.assertEqual(second.data["status"], "completed")
            self.assertIsNone(second.data["endLocation"])
            self.assertTrue(all(e["reviewerId"] == self.users["account"].pk for e in second.data["exceptions"]))
            self.assertEqual(visit.eventos.filter(tipo="review").count(), 2)
            if origin == "ticket":
                visit.ticket_origen.refresh_from_db()
                self.assertEqual(visit.ticket_origen.estado, "resuelto")
            self.login_as("tech")

    def test_time_approval_then_real_gps_can_finish(self):
        visit = self.visit()
        self.start(visit)
        self.post(f"visitas/{visit.pk}/formulario/", {"failure": "unavailable"})
        self.draft(visit)
        opened = timezone.now()-timedelta(minutes=6)
        Visita.objects.filter(pk=visit.pk).update(iniciado_en=opened-timedelta(minutes=8), formulario_abierto_en=opened, formulario_vence_en=opened+timedelta(minutes=5))
        response = self.post(f"visitas/{visit.pk}/excepciones/", {"type": "time_limit", "reason": "Device powered off during registration"})
        self.login_as("account")
        review = self.post(f"visitas/{visit.pk}/revisar/", {"exceptionId": response.data["exceptions"][0]["id"], "approved": True, "reason": "Checked complete content and timing issue"})
        self.assertEqual(review.data["status"], "pending_approval")
        self.login_as("tech")
        gps = self.post(f"visitas/{visit.pk}/ubicacion-cierre/", {"location": self.gps()})
        self.assertEqual(gps.status_code, 200, gps.data)
        self.assertEqual(gps.data["status"], "completed")

    def test_database_constraints_and_report_scope(self):
        visit = self.visit()
        self.start(visit)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Visita.objects.filter(pk=visit.pk).update(formulario_abierto_en=timezone.now())
        self.open(visit)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Visita.objects.filter(pk=visit.pk).update(formulario_vence_en=timezone.now()+timedelta(minutes=10))
        self.draft(visit)
        self.post(f"visitas/{visit.pk}/finalizar/", {"location": self.gps()})
        self.contract.activo = False
        self.contract.save()
        self.login_as("account")
        period = timezone.localdate().replace(day=1).isoformat()
        dashboard = self.client.get("/api/dashboard/", {"period": period})
        self.assertEqual(dashboard.status_code, 200)
        self.assertEqual(dashboard.data["compliance"], 100)
        another_client = Cliente.objects.create(razon_social="Another authorized client", ruc="TEST-2")
        another_store = Tienda.objects.create(cliente=another_client, nombre="Another store", direccion="Address", latitud="-12", longitud="-77")
        AsignacionTienda.objects.create(usuario=self.users["account"], tienda=another_store)
        filtered = self.client.get("/api/dashboard/", {"period": period, "clientId": self.store.cliente_id})
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual(filtered.data["compliance"], 100)
        self.assertEqual({c["id"] for c in filtered.data["clients"]}, {self.store.cliente_id, another_client.pk})
        foreign_client = Cliente.objects.create(razon_social="Foreign client", ruc="FOREIGN")
        self.assertEqual(self.client.get("/api/dashboard/", {"period": period, "clientId": foreign_client.pk}).status_code, 403)
        exported = self.client.get("/api/reportes/exportar/", {"period": period})
        self.assertEqual(exported.status_code, 200)
        self.assertIn("previo_formulario_s", exported.content.decode("utf8"))
        import csv
        from io import StringIO
        rows = list(csv.DictReader(StringIO(exported.content.decode("utf-8-sig"))))
        self.assertEqual(rows[0]["contrato"], str(self.contract.pk))
        self.assertEqual(rows[0]["periodo"], period)
        self.assertEqual(rows[0]["cuota"], "1")
        self.assertEqual(rows[0]["cuotas_mes"], "1")
        self.assertEqual(rows[0]["estado"], "Finalizado")
        self.assertEqual(self.client.get("/api/reportes/", {"period": period[:-2]+"20"}).status_code, 400)
        self.login_as("outsider")
        self.assertEqual(self.client.get("/api/reportes/", {"clientId": self.store.cliente_id}).status_code, 403)


    def test_checklist_walkthrough_has_no_form_deadline_and_opens_after_gps(self):
        visit = self.visit()
        self.assertEqual(self.start(visit).status_code, 200)
        visit.refresh_from_db()
        self.assertEqual(visit.estado, "en_curso")
        self.assertIsNone(visit.formulario_abierto_en)
        self.assertIsNone(visit.formulario_vence_en)
        self.assertIsNone(visit.completado_en)
        self.assertEqual(visit.checklist.tareas_snapshot[0]["id"], self.item.pk)
        Visita.objects.filter(pk=visit.pk).update(iniciado_en=timezone.now()-timedelta(minutes=30))
        opened = self.open(visit)
        self.assertEqual(opened.status_code, 200, opened.data)
        visit.refresh_from_db()
        self.assertEqual(visit.formulario_vence_en-visit.formulario_abierto_en, timedelta(minutes=5))
        self.assertGreater(visit.formulario_abierto_en-visit.iniciado_en, timedelta(minutes=29))
        self.assertTrue(visit.ubicacion_cierre["validated"])
        self.assertTrue(visit.eventos.filter(tipo="end_gps").exists())
        self.assertIsNone(visit.enviado_en)
        self.assertIsNone(visit.completado_en)
        deadline = visit.formulario_vence_en
        self.assertEqual(self.post(f"visitas/{visit.pk}/formulario/").status_code, 200)
        visit.refresh_from_db()
        self.assertEqual(visit.formulario_vence_en, deadline)
        captured = timezone.now()-timedelta(minutes=20)
        response = self.client.post("/api/evidencias/", {
            "id": str(uuid.uuid4()), "foto": image_file(), "source": "camera",
            "capturedAt": captured.isoformat(), "visitId": visit.pk, "taskId": self.item.pk,
        }, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Evidencia.objects.get(visita=visit).capturada_en, captured)

    def test_checklist_invalid_close_gps_does_not_open_form(self):
        visit = self.visit()
        self.start(visit)
        gps = {**self.gps(), "latitude": 0, "longitude": 0}
        response = self.post(f"visitas/{visit.pk}/formulario/", {"location": gps})
        self.assertEqual(response.status_code, 400)
        visit.refresh_from_db()
        self.assertIsNone(visit.formulario_abierto_en)
        self.assertIsNone(visit.formulario_vence_en)
        self.assertIsNone(visit.ubicacion_cierre)

    def test_checklist_unavailable_gps_keeps_existing_exception_path(self):
        visit = self.visit()
        self.start(visit)
        self.assertEqual(self.post(f"visitas/{visit.pk}/formulario/", {"failure": "denied"}).status_code, 200)
        visit.refresh_from_db()
        self.assertIsNone(visit.ubicacion_cierre)
        self.assertIsNone(visit.completado_en)
        self.assertTrue(visit.eventos.filter(tipo="end_gps_unavailable").exists())
        self.draft(visit)
        response = self.post(f"visitas/{visit.pk}/excepciones/", {
            "type": "location", "failure": "denied", "reason": "GPS permission unavailable after finishing the walkthrough.",
        })
        self.assertEqual(response.status_code, 200, response.data)
        visit.refresh_from_db()
        self.assertEqual(visit.estado, "pendiente_validacion")
        self.assertIsNone(visit.completado_en)

    def test_ticket_form_opening_does_not_require_checklist_close_gps(self):
        visit = self.visit("ticket")
        self.start(visit)
        self.assertEqual(self.post(f"visitas/{visit.pk}/formulario/").status_code, 200)
        visit.refresh_from_db()
        self.assertIsNone(visit.ubicacion_cierre)
        self.assertEqual(visit.formulario_vence_en-visit.formulario_abierto_en, timedelta(minutes=5))


class ConcurrencyTests(TransactionTestCase):
    def setUp(self):
        self.users, self.store, self.template, self.item, self.contract, self.category, self.urgency = fixtures()

    def parallel(self, function, names):
        barrier = Barrier(len(names))
        def run(name):
            close_old_connections()
            client = APIClient()
            client.force_authenticate(self.users[name])
            barrier.wait(timeout=10)
            try:
                return function(client, name)
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=len(names)) as executor:
            return list(executor.map(run, names))

    def test_month_generation_has_no_duplicates(self):
        self.contract.frecuencia_visitas_mensual = 3
        self.contract.save()
        results = self.parallel(lambda client, name: client.post("/api/checklists/generar/", {}, format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).status_code, ["tech", "othertech"])
        self.assertEqual(results, [200, 200])
        self.assertEqual(Visita.objects.count(), 3)
        self.assertEqual(Checklist.objects.count(), 3)
        self.assertEqual(list(Visita.objects.order_by("cuota").values_list("cuota", flat=True)), [1, 2, 3])

    def test_claim_is_atomic(self):
        generate_month(self.users["tech"])
        visit = Visita.objects.get()
        results = self.parallel(lambda client, name: client.post(f"/api/visitas/pool/{visit.pk}/tomar/", {}, format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).status_code, ["tech", "othertech"])
        self.assertEqual(sorted(results), [200, 409])

    def test_expired_claim_concurrent_reclaim_has_one_release_and_one_owner(self):
        from .models import Evento
        generate_month(self.users["tech"])
        visit = Visita.objects.get()
        visit.tecnico = self.users["tech"]
        visit.reclamada_en = timezone.now()-timedelta(hours=2, minutes=1)
        visit.reclamo_vence_en = visit.reclamada_en+timedelta(hours=2)
        visit.save()
        results = self.parallel(lambda client, name: client.post(f"/api/visitas/pool/{visit.pk}/tomar/", {}, format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).status_code, ["tech", "othertech"])
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(Evento.objects.filter(visita=visit, tipo="claim_release").count(), 1)
        self.assertEqual(Evento.objects.filter(visita=visit, tipo="claim").count(), 1)
        visit.refresh_from_db()
        self.assertIn(visit.tecnico_id, [self.users["tech"].pk, self.users["othertech"].pk])
        self.assertGreater(visit.reclamo_vence_en, timezone.now())

    def test_simultaneous_open_uses_first_deadline(self):
        generate_month(self.users["tech"])
        visit = Visita.objects.get()
        visit.tecnico = self.users["tech"]
        visit.iniciado_en = timezone.now()-timedelta(minutes=10)
        visit.estado = "en_curso"
        visit.save()
        results = self.parallel(lambda client, name: client.post(f"/api/visitas/{visit.pk}/formulario/", {"location": {"latitude": float(self.store.latitud), "longitude": float(self.store.longitud), "accuracy": 8, "capturedAt": timezone.now().timestamp()*1000}}, format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).data, ["tech", "tech"])
        self.assertEqual(results[0]["expiresAt"], results[1]["expiresAt"])
        visit.refresh_from_db()
        self.assertEqual(visit.formulario_vence_en-visit.formulario_abierto_en, timedelta(minutes=5))

    def running(self):
        generate_month(self.users["tech"])
        visit = Visita.objects.get()
        opened = timezone.now()
        visit.tecnico = self.users["tech"]
        visit.iniciado_en = opened-timedelta(minutes=8)
        visit.formulario_abierto_en = opened
        visit.formulario_vence_en = opened+timedelta(minutes=5)
        visit.estado = "en_curso"
        visit.save()
        return visit

    def test_concurrent_drafts_cannot_overwrite_same_revision(self):
        visit = self.running()
        body = {"revision": 0, "answers": [{"taskId": self.item.pk, "result": "conforme", "observation": "", "evidenceIds": []}], "workDescription": "", "evidenceIds": []}
        results = self.parallel(lambda client, name: client.post(f"/api/visitas/{visit.pk}/borrador/", body, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).status_code, ["tech", "tech"])
        self.assertEqual(sorted(results), [200, 409])
        visit.refresh_from_db()
        self.assertEqual(visit.borrador_revision, 1)
        self.assertEqual(RespuestaItem.objects.count(), 1)

    def test_concurrent_upload_same_uuid_has_one_file(self):
        visit = self.running()
        evidence_id = str(uuid.uuid4())
        def upload(client, name):
            return client.post("/api/evidencias/", {"id": evidence_id, "foto": image_file(), "source": "gallery", "visitId": visit.pk, "taskId": self.item.pk}, format="multipart").status_code
        self.assertEqual(sorted(self.parallel(upload, ["tech", "tech"])), [200, 201])
        self.assertEqual(Evidencia.objects.count(), 1)

    def test_concurrent_finalization_is_one_accepted_event(self):
        visit = self.running()
        evidence = Evidencia.objects.create(visita=visit, checklist=visit.checklist, item=self.item, autor=self.users["tech"], foto=image_file())
        RespuestaItem.objects.create(checklist=visit.checklist, item=self.item, resultado="ok")
        gps = {"latitude": float(self.store.latitud), "longitude": float(self.store.longitud), "accuracy": 8, "capturedAt": timezone.now().timestamp()*1000}
        results = self.parallel(lambda client, name: client.post(f"/api/visitas/{visit.pk}/finalizar/", {"location": gps}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).data, ["tech", "tech"])
        self.assertEqual(results[0]["completedAt"], results[1]["completedAt"])
        self.assertEqual(visit.eventos.filter(tipo="complete").count(), 1)

    def test_concurrent_ticket_creation_same_key_is_one_record(self):
        key = str(uuid.uuid4())
        body = {"storeId": self.store.pk, "categoryId": self.category.pk, "priorityId": self.urgency.pk, "description": "Reported electrical fault in test store", "evidenceIds": []}
        results = self.parallel(lambda client, name: client.post("/api/tickets/", body, format="json", HTTP_IDEMPOTENCY_KEY=key).data, ["store", "store"])
        self.assertEqual(results[0]["id"], results[1]["id"])
        self.assertEqual(Ticket.objects.count(), 1)

    def test_concurrent_scheduling_checks_revision_and_one_visit(self):
        ticket = Ticket.objects.create(tienda=self.store, categoria=self.category, urgencia=self.urgency, reportado_por=self.users["store"], descripcion="Reported electrical fault")
        body = {"technicianId": self.users["tech"].pk, "scheduledAt": (timezone.now()+timedelta(hours=1)).isoformat(), "priorityId": self.urgency.pk, "reason": "", "revision": 0}
        results = self.parallel(lambda client, name: client.post(f"/api/tickets/{ticket.pk}/programar/", body, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).status_code, ["account", "account"])
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(Visita.objects.filter(ticket_origen=ticket, vigente=True).count(), 1)

    def test_start_and_reassignment_cannot_both_win(self):
        from .generation import snapshot
        ticket = Ticket.objects.create(tienda=self.store, categoria=self.category, urgencia=self.urgency,
            reportado_por=self.users["store"], tecnico_asignado=self.users["tech"], estado="programado", descripcion="Reported issue")
        visit = Visita(tienda=self.store, origen="ticket", tecnico=self.users["tech"], ticket_origen=ticket,
                       fecha_programada=timezone.now()+timedelta(hours=1))
        snapshot(visit, self.contract)
        visit.save()
        gps = {"latitude": float(self.store.latitud), "longitude": float(self.store.longitud),
               "accuracy": 8, "capturedAt": timezone.now().timestamp()*1000}
        body = {"technicianId": self.users["othertech"].pk, "scheduledAt": (timezone.now()+timedelta(hours=2)).isoformat(),
                "priorityId": self.urgency.pk, "reason": "Technician replacement before work begins", "revision": 0}
        def race(client, name):
            path, data = (f"/api/visitas/{visit.pk}/iniciar/", {"location": gps}) if name == "tech" else (f"/api/tickets/{ticket.pk}/programar/", body)
            return client.post(path, data, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).status_code
        results = self.parallel(race, ["tech", "account"])
        self.assertIn(results, ([200, 409], [404, 200]))
        self.assertEqual(Visita.objects.filter(ticket_origen=ticket, vigente=True).count(), 1)
        ticket.refresh_from_db()
        active = Visita.objects.get(ticket_origen=ticket, vigente=True)
        self.assertEqual(active.tecnico_id, ticket.tecnico_asignado_id)
        self.assertEqual(active.estado == "en_curso", results[0] == 200)

    def test_concurrent_contracts_cannot_overlap(self):
        client = Cliente.objects.create(razon_social="Concurrent contract client", ruc="CONCURRENT")
        body = {"clientId": client.pk, "templateId": self.template.pk, "startDate": timezone.localdate().isoformat(),
                "endDate": None, "monthlyVisits": 1, "monthlyInterventions": 2, "radiusMeters": 100, "active": True}
        results = self.parallel(lambda api, name: api.post("/api/admin/contratos/", body, format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).status_code, ["admin", "admin"])
        self.assertEqual(sorted(results), [201, 400])
        self.assertEqual(Contrato.objects.filter(cliente=client).count(), 1)
