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
from .models import (
    Rol,
    Usuario,
    Cliente,
    Tienda,
    AsignacionTienda,
    PlantillaChecklist,
    ItemPlantilla,
    Contrato,
    Visita,
    Checklist,
    RespuestaItem,
    Evidencia,
    Ticket,
    CategoriaProblema,
    NivelUrgencia,
    ReasignacionTicket,
    Zona,
    CoberturaUsuario,
    ClienteEspecialidad,
)
from .generation import generate_month

PASSWORD = "Field-test-secure-2026!"


def image_file():
    output = BytesIO()
    Image.new("RGB", (4, 4), color="blue").save(output, "JPEG")
    return SimpleUploadedFile(
        "evidence.jpg", output.getvalue(), content_type="image/jpeg"
    )


def fixtures():
    roles = {
        name: Rol.objects.create(nombre=name)
        for name in [
            "Tecnico",
            "Supervisor de cuenta",
            "Supervisor de tienda",
            "Administrador",
        ]
    }
    users = {}
    for name, role in [
        ("tech", "Tecnico"),
        ("othertech", "Tecnico"),
        ("account", "Supervisor de cuenta"),
        ("store", "Supervisor de tienda"),
        ("admin", "Administrador"),
        ("outsider", "Supervisor de cuenta"),
    ]:
        users[name] = Usuario.objects.create_user(
            username=name,
            email=f"{name}@test.invalid",
            password=PASSWORD,
            rol=roles[role],
            password_initialized=True,
        )
    client = Cliente.objects.create(razon_social="Test client", ruc="TEST-1")
    zone = Zona.objects.create(cliente=client, nombre="Zona explícita de pruebas")
    store = Tienda.objects.create(
        cliente=client,
        zona=zone,
        nombre="Test store",
        direccion="Test address",
        latitud="-12.173900",
        longitud="-77.018100",
    )
    AsignacionTienda.objects.create(usuario=users["store"], tienda=store)
    for name in ["tech", "othertech", "account"]:
        CoberturaUsuario.objects.create(usuario=users[name], cliente=client, zona=zone)
    template = PlantillaChecklist.objects.create(nombre="Test template")
    item = ItemPlantilla.objects.create(
        plantilla=template, descripcion="Inspect device", foto_obligatoria=True
    )
    contract = Contrato.objects.create(
        cliente=client,
        plantilla_checklist=template,
        fecha_inicio=timezone.localdate().replace(day=1),
        radio_validacion_metros=100,
    )
    category = CategoriaProblema.objects.create(nombre="Eléctrico")
    ClienteEspecialidad.objects.create(cliente=client, categoria=category)
    urgency = NivelUrgencia.objects.create(
        nombre="Alta", sla_primera_respuesta_horas=2, sla_resolucion_horas=24
    )
    return users, store, template, item, contract, category, urgency


class IntegrationTests(TestCase):
    def setUp(self):
        (
            self.users,
            self.store,
            self.template,
            self.item,
            self.contract,
            self.category,
            self.urgency,
        ) = fixtures()
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
        if path.endswith("/finalizar/"):
            payload.setdefault(
                "revision",
                Visita.objects.get(pk=int(path.split("/")[1])).borrador_revision,
            )
        return self.client.post(
            "/api/" + path,
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()),
        )

    def gps(self):
        return {
            "latitude": float(self.store.latitud),
            "longitude": float(self.store.longitud),
            "accuracy": 8,
            "capturedAt": timezone.now().timestamp() * 1000,
        }

    def visit(self, origin="checklist"):
        if origin == "checklist":
            generate_month(self.users["tech"])
            return Visita.objects.get(origen="checklist")
        ticket = Ticket.objects.create(
            tienda=self.store,
            categoria=self.category,
            urgencia=self.urgency,
            reportado_por=self.users["store"],
            tecnico_asignado=self.users["tech"],
            estado="programado",
            descripcion="Reported issue",
        )
        from .generation import snapshot

        visit = Visita(
            tienda=self.store,
            origen="ticket",
            tecnico=self.users["tech"],
            ticket_origen=ticket,
            fecha_programada=timezone.now(),
        )
        snapshot(visit, self.contract)
        visit.save()
        return visit

    def start(self, visit):
        if visit.origen == "checklist":
            self.assertEqual(
                self.post(f"visitas/pool/{visit.pk}/tomar/").status_code, 200
            )
        return self.post(f"visitas/{visit.pk}/iniciar/", {"location": self.gps()})

    def close(self, visit):
        return self.post(f"visitas/{visit.pk}/terminar/", {})

    def open(self, visit):
        visit.refresh_from_db()
        if not visit.terminado_en:
            closed = self.close(visit)
            self.assertEqual(closed.status_code, 200, closed.data)
        return self.post(f"visitas/{visit.pk}/formulario/")

    def expire(self, visit):
        opened = timezone.now() - timedelta(minutes=6)
        Visita.objects.filter(pk=visit.pk).update(
            iniciado_en=opened - timedelta(minutes=8),
            terminado_en=opened - timedelta(seconds=1),
            formulario_abierto_en=opened,
            formulario_vence_en=opened + timedelta(minutes=5),
        )
        visit.refresh_from_db()
        return visit.formulario_vence_en

    def upload(self, visit, evidence_id=None):
        data = {
            "id": evidence_id or str(uuid.uuid4()),
            "foto": image_file(),
            "source": "gallery",
            "capturedAt": timezone.now().isoformat(),
            "visitId": visit.pk,
        }
        if visit.origen == "checklist":
            data["taskId"] = self.item.pk
        return self.client.post("/api/evidencias/", data, format="multipart")

    def arrival_photo(self, visit):
        response = self.client.post(
            "/api/evidencias/",
            {
                "id": str(uuid.uuid4()),
                "foto": image_file(),
                "source": "camera",
                "capturedAt": timezone.now().isoformat(),
                "visitId": visit.pk,
                "purpose": "arrival",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["id"]

    def historical_exception(self, visit, payload):
        """Fixture de datos anteriores a P0, nunca una petición de creación nueva."""
        from .models import Excepcion
        from .serializers import visit_data
        from rest_framework.response import Response

        visit.refresh_from_db()
        scope = payload.get(
            "scope", "form" if payload["type"] == "time_limit" else "legacy"
        )
        if scope == "closure" and not visit.terminado_en:
            self.close(visit)
            visit.refresh_from_db()
        telemetry = None
        if payload["type"] == "location":
            from .gps import evaluate_gps

            telemetry = evaluate_gps(
                payload.get("location"), visit, payload.get("failure", "unavailable")
            )
            Visita.objects.filter(pk=visit.pk).update(ubicacion_cierre=telemetry)
            visit.refresh_from_db()
        exception = Excepcion.objects.create(
            visita=visit,
            autor=self.users["tech"],
            tipo=payload["type"],
            scope=scope,
            motivo=payload["reason"],
            fallo=payload.get("failure", ""),
            telemetria=telemetry,
        )
        from .services import audit_exception

        audit_exception(
            self.users["tech"],
            visit,
            exception,
            "exception",
            "Solicitud histórica conservada",
        )
        return Response(visit_data(visit))

    def draft(self, visit):
        response = self.upload(visit)
        self.assertEqual(response.status_code, 201, response.data)
        evidence_id = response.data["id"]
        visit.refresh_from_db()
        draft = {
            "revision": visit.borrador_revision,
            "answers": [],
            "workDescription": "",
            "evidenceIds": [],
        }
        if visit.origen == "checklist":
            draft["answers"] = [
                {
                    "taskId": self.item.pk,
                    "result": "conforme",
                    "observation": "",
                    "evidenceIds": [evidence_id],
                }
            ]
        else:
            draft.update(
                workDescription="Replaced valve and verified function",
                evidenceIds=[evidence_id],
            )
        response = self.post(f"visitas/{visit.pk}/borrador/", draft)
        self.assertEqual(response.status_code, 200, response.data)
        return evidence_id, draft

    def test_postgresql_is_used(self):
        self.assertEqual(connection.vendor, "postgresql")
        self.assertEqual(
            self.post("checklists/generar/", {"period": "invalid"}).status_code, 400
        )
        self.assertEqual(
            self.post("checklists/generar/", {"period": "2020-01-01"}).status_code, 400
        )
        self.assertEqual(Visita.objects.count(), 0)

    def test_multiple_monthly_visits_are_independent_and_published_plan_is_preserved(
        self,
    ):
        self.contract.frecuencia_visitas_mensual = 3
        self.contract.save()
        ids = generate_month(self.users["tech"])
        self.assertEqual(len(ids), 3)
        self.assertEqual(
            list(Visita.objects.order_by("cuota").values_list("cuota", flat=True)),
            [1, 2, 3],
        )
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
        self.assertEqual(
            self.post(f"visitas/{visit.pk}/finalizar/", {}).status_code, 200
        )
        self.assertEqual(Visita.objects.filter(estado="completada").count(), 1)
        self.login_as("account")
        dashboard = self.client.get("/api/dashboard/")
        self.assertAlmostEqual(dashboard.data["compliance"], 100 / 3)
        self.assertEqual(dashboard.data["pendingVisits"], 2)
        self.assertEqual(dashboard.data["risks"][0]["required"], 2)

    def test_contract_overlap_is_rejected_by_api_and_postgresql(self):
        self.contract.fecha_fin = self.contract.fecha_inicio + timedelta(days=10)
        self.contract.save()
        self.login_as("admin")
        body = {
            "clientId": self.store.cliente_id,
            "templateId": self.template.pk,
            "startDate": self.contract.fecha_fin.isoformat(),
            "endDate": None,
            "monthlyVisits": 1,
            "monthlyInterventions": 2,
            "radiusMeters": 100,
            "active": True,
        }
        response = self.post("admin/contratos/", body)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("startDate", response.data)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Contrato.objects.create(
                cliente=self.store.cliente,
                plantilla_checklist=self.template,
                fecha_inicio=self.contract.fecha_fin,
                minimo_intervenciones_mensual=2,
            )
        body["startDate"] = (self.contract.fecha_fin + timedelta(days=1)).isoformat()
        consecutive = self.post("admin/contratos/", body)
        self.assertEqual(consecutive.status_code, 201, consecutive.data)
        # Contratos distintos del mismo mes, sin fechas simultáneas, son válidos.
        self.login_as("tech")
        self.assertEqual(self.post("checklists/generar/").status_code, 200)
        self.assertEqual(
            Visita.objects.filter(tienda=self.store, origen="checklist").count(), 1
        )
        self.login_as("admin")
        response = self.client.patch(
            f"/api/admin/contratos/{consecutive.data['id']}/",
            {"startDate": self.contract.fecha_fin.isoformat()},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get("/api/dashboard/").status_code, 403)

    def test_ticket_minimum_is_separate_for_each_store_and_excludes_checklists(self):
        second_store = Tienda.objects.create(
            cliente=self.store.cliente,
            zona=self.store.zona,
            nombre="Second store",
            direccion="Address",
            latitud="-12",
            longitud="-77",
        )
        generate_month(self.users["tech"])
        checklist = Visita.objects.get(origen="checklist", tienda=self.store)
        self.start(checklist)
        self.open(checklist)
        self.draft(checklist)
        self.assertEqual(
            self.post(f"visitas/{checklist.pk}/finalizar/", {}).status_code, 200
        )
        self.login_as("account")
        initial = self.client.get("/api/dashboard/")
        self.assertTrue(all(row["completed"] == 0 for row in initial.data["risks"]))
        self.login_as("tech")
        for index in range(3):
            visit = self.visit("ticket")
            if index == 1:
                # Un ticket reportado antes de este mes y atendido ahora sí cuenta.
                Ticket.objects.filter(pk=visit.ticket_origen_id).update(
                    creado_en=timezone.now() - timedelta(days=40)
                )
            self.start(visit)
            self.open(visit)
            self.draft(visit)
            if index < 2:
                self.assertEqual(
                    self.post(f"visitas/{visit.pk}/finalizar/", {}).status_code, 200
                )
            else:
                self.expire(visit)
                self.assertEqual(
                    self.historical_exception(
                        visit,
                        {
                            "type": "time_limit",
                            "reason": "Connection failure during registration",
                        },
                    ).status_code,
                    200,
                )
        self.login_as("account")
        dashboard = self.client.get("/api/dashboard/")
        self.assertEqual(dashboard.status_code, 200, dashboard.data)
        metrics = {row["storeId"]: row for row in dashboard.data["risks"]}
        self.assertEqual(
            (
                metrics[self.store.pk]["completed"],
                metrics[self.store.pk]["required"],
                metrics[self.store.pk]["missing"],
            ),
            (2, 2, 0),
        )
        self.assertEqual(
            (
                metrics[second_store.pk]["completed"],
                metrics[second_store.pk]["required"],
                metrics[second_store.pk]["missing"],
            ),
            (0, 2, 2),
        )
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
            self.assertEqual(
                self.post(f"visitas/pool/{ids[1]}/tomar/").status_code, 200
            )
        # Una reserva de dos horas no autoriza iniciar una obligación del mes anterior.
        next_month = end_of_month + timedelta(hours=1)
        with patch("core.services.timezone.now", return_value=next_month):
            self.assertEqual(
                self.post(
                    f"visitas/{ids[1]}/iniciar/", {"location": self.gps()}
                ).status_code,
                409,
            )
            self.assertEqual(
                self.post(f"visitas/pool/{ids[1]}/tomar/").status_code, 409
            )
            # La ejecución que ya inició sí conserva continuidad y sus horas reales.
            self.assertEqual(
                self.post(
                    f"visitas/{ids[0]}/iniciar/", {"location": self.gps()}
                ).status_code,
                200,
            )
            self.assertEqual(self.open(first).status_code, 200)
        second = Visita.objects.get(pk=ids[1])
        self.assertIsNone(second.iniciado_en)
        self.assertIsNone(second.formulario_abierto_en)

    def test_contract_minimum_is_at_least_two_per_store(self):
        self.login_as("admin")
        body = {
            "clientId": self.store.cliente_id,
            "templateId": self.template.pk,
            "startDate": (timezone.localdate() + timedelta(days=365)).isoformat(),
            "endDate": None,
            "monthlyVisits": 1,
            "monthlyInterventions": 1,
            "radiusMeters": 100,
            "active": True,
        }
        response = self.post("admin/contratos/", body)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("monthlyInterventions", response.data)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Contrato.objects.filter(pk=self.contract.pk).update(
                minimo_intervenciones_mensual=1
            )

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
        self.assertEqual(
            visit.reclamo_vence_en - visit.reclamada_en, timedelta(hours=2)
        )
        visit.reclamada_en = timezone.now() - timedelta(hours=2, seconds=1)
        visit.reclamo_vence_en = visit.reclamada_en + timedelta(hours=2)
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
        self.assertEqual(
            [h["kind"] for h in reclaimed.data["claimHistory"]],
            ["claim", "claim_release", "claim"],
        )
        self.assertEqual(
            self.post(
                f"visitas/{visit.pk}/iniciar/", {"location": self.gps()}
            ).status_code,
            200,
        )
        self.login_as("tech")
        self.assertEqual(
            self.post(
                f"visitas/{visit.pk}/iniciar/", {"location": self.gps()}
            ).status_code,
            404,
        )

    def test_claim_release_boundary_scope_and_database_constraints(self):
        from .claims import release_expired_claims

        visit = self.visit()
        self.post(f"visitas/pool/{visit.pk}/tomar/")
        visit.refresh_from_db()
        deadline = visit.reclamo_vence_en
        with patch(
            "core.claims.timezone.now",
            return_value=deadline - timedelta(microseconds=1),
        ):
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
        visit.reclamada_en = timezone.now() - timedelta(hours=3)
        visit.reclamo_vence_en = visit.reclamada_en + timedelta(hours=2)
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
        self.assertIsNone(visit.formulario_vence_en)

    def test_claim_expiring_during_gps_validation_cannot_start(self):
        from .services import start_visit, Conflict

        visit = self.visit()
        self.post(f"visitas/pool/{visit.pk}/tomar/")
        visit.refresh_from_db()
        clock = {"now": visit.reclamo_vence_en - timedelta(seconds=1)}

        def gps_crossing_deadline(*args):
            clock["now"] = visit.reclamo_vence_en
            return {**self.gps(), "validated": True}

        with patch(
            "core.services.timezone.now", side_effect=lambda: clock["now"]
        ), patch("core.services.validate_gps", side_effect=gps_crossing_deadline):
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
        self.assertEqual(
            self.post(
                f"visitas/{visit.pk}/iniciar/", {"location": self.gps()}
            ).status_code,
            409,
        )
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
                original_start = timezone.now() - timedelta(minutes=8)
                Visita.objects.filter(pk=visit.pk).update(iniciado_en=original_start)
                opened = self.open(visit)
                self.assertEqual(opened.status_code, 200, opened.data)
                visit.refresh_from_db()
                self.assertIsNone(visit.formulario_vence_en)
                repeated = self.open(visit)
                self.assertEqual(repeated.data["expiresAt"], opened.data["expiresAt"])
                evidence_id, draft = self.draft(visit)
                other_session = APIClient()
                other_session.force_authenticate(self.users["tech"])
                recovered = other_session.get(f"/api/visitas/{visit.pk}/")
                self.assertEqual(recovered.status_code, 200)
                self.assertEqual(recovered.data["expiresAt"], opened.data["expiresAt"])
                self.assertEqual(recovered.data["revision"], 2)
                self.assertEqual(
                    other_session.get(
                        f"/api/evidencias/{evidence_id}/archivo/"
                    ).status_code,
                    200,
                )
                key = str(uuid.uuid4())
                visit.refresh_from_db()
                body = {"revision": visit.borrador_revision}
                complete = self.post(f"visitas/{visit.pk}/finalizar/", body, key)
                self.assertEqual(complete.status_code, 200, complete.data)
                replay = self.post(f"visitas/{visit.pk}/finalizar/", body, key)
                self.assertEqual(
                    replay.data["completedAt"], complete.data["completedAt"]
                )
                self.assertGreater(complete.data["totalSeconds"], 7 * 60)
                self.assertGreater(complete.data["executionSeconds"], 7 * 60)
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
        draft["revision"] = 2
        draft["answers"][0].update(
            result="no_conforme", observation="Observed damaged insulation"
        )
        key = str(uuid.uuid4())
        response = self.post(f"visitas/{visit.pk}/borrador/", draft, key)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.post(f"visitas/{visit.pk}/borrador/", draft, key).data["revision"], 3
        )
        self.assertEqual(
            self.post(f"visitas/{visit.pk}/borrador/", draft).status_code, 409
        )
        self.assertEqual(RespuestaItem.objects.count(), 1)
        self.assertEqual(
            RespuestaItem.objects.get().observacion, "Observed damaged insulation"
        )
        changed = {**draft, "workDescription": "Different body"}
        self.assertEqual(
            self.post(f"visitas/{visit.pk}/borrador/", changed, key).status_code, 409
        )

    def test_expiration_justification_no_reset_and_incomplete_review(self):
        for origin in ("checklist", "ticket"):
            visit = self.visit(origin)
            self.start(visit)
            self.open(visit)
            deadline = self.expire(visit)
            self.assertEqual(
                self.post(f"visitas/{visit.pk}/finalizar/", {}).status_code, 400
            )
            response = self.historical_exception(
                visit,
                {
                    "type": "time_limit",
                    "reason": "Phone powered off during registration",
                },
            )
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["workStatus"], "in_progress")
            self.assertIsNone(response.data["submittedAt"])
            visit.refresh_from_db()
            self.assertEqual(visit.formulario_vence_en, deadline)
            self.login_as("account")
            reviewed = self.post(
                f"visitas/{visit.pk}/revisar/",
                {
                    "exceptionId": response.data["exceptions"][0]["id"],
                    "approved": True,
                    "reason": "Reviewed loss of connection",
                },
            )
            self.assertEqual(reviewed.status_code, 409)
            self.login_as("tech")
            self.assertEqual(
                self.post(
                    f"visitas/{visit.pk}/enviar-revision/", {"revision": 0}
                ).status_code,
                400,
            )
            self.assertEqual(
                self.post(
                    f"visitas/{visit.pk}/no-realizada/",
                    {"reason": "Attempt cannot be completed today"},
                ).status_code,
                200,
            )

    def test_expired_incomplete_registration_can_be_completed_rejected_corrected_and_approved(
        self,
    ):
        for origin in ("checklist", "ticket"):
            visit = self.visit(origin)
            self.start(visit)
            self.open(visit)
            deadline = self.expire(visit)
            requested = self.historical_exception(
                visit,
                {
                    "type": "time_limit",
                    "reason": "Phone lost connection during registration",
                },
            )
            self.assertEqual(requested.data["workStatus"], "in_progress")
            self.assertIsNone(requested.data["submittedAt"])
            exception_id = requested.data["exceptions"][0]["id"]
            self.login_as("account")
            premature = self.post(
                f"visitas/{visit.pk}/revisar/",
                {
                    "exceptionId": exception_id,
                    "approved": False,
                    "reason": "Explain connectivity failure in detail",
                },
            )
            self.assertEqual(premature.status_code, 409)
            self.login_as("tech")
            _, draft = self.draft(visit)
            visit.refresh_from_db()
            body = {"revision": visit.borrador_revision}
            key = str(uuid.uuid4())
            submitted = self.post(f"visitas/{visit.pk}/enviar-revision/", body, key)
            self.assertEqual(submitted.status_code, 200, submitted.data)
            self.assertEqual(submitted.data["workStatus"], "in_review")
            self.assertEqual(
                self.post(
                    f"visitas/{visit.pk}/enviar-revision/", body, key
                ).status_code,
                200,
            )
            self.assertEqual(
                self.post(
                    f"visitas/{visit.pk}/borrador/",
                    {**draft, "revision": submitted.data["revision"]},
                ).status_code,
                409,
            )
            self.login_as("account")
            rejected = self.post(
                f"visitas/{visit.pk}/revisar/",
                {
                    "exceptionId": exception_id,
                    "approved": False,
                    "reason": "Describe the failure and recovery in detail",
                },
            )
            self.assertEqual(rejected.data["workStatus"], "correction_required")
            self.login_as("tech")
            self.assertEqual(
                self.post(f"visitas/{visit.pk}/enviar-revision/", body).status_code, 400
            )
            corrected = self.post(
                f"visitas/{visit.pk}/excepciones/",
                {
                    "type": "time_limit",
                    "reason": "Network outage prevented uploading photographs on time",
                    "revision": 0,
                },
            )
            self.assertEqual(corrected.status_code, 200, corrected.data)
            resubmitted = self.post(f"visitas/{visit.pk}/enviar-revision/", body)
            self.assertEqual(resubmitted.status_code, 200, resubmitted.data)
            self.login_as("account")
            approved = self.post(
                f"visitas/{visit.pk}/revisar/",
                {
                    "exceptionId": exception_id,
                    "approved": True,
                    "reason": "Verified corrected justification and content",
                },
            )
            self.assertEqual(approved.data["workStatus"], "finished")
            self.assertEqual(approved.data["expiresAt"], deadline.isoformat())
            self.assertEqual(visit.eventos.filter(tipo="review_submission").count(), 2)
            decisions = [
                e["exception"]["approved"]
                for e in approved.data["exceptionHistory"]
                if e["kind"] == "review"
            ]
            self.assertEqual(decisions, [False, True])
            self.login_as("tech")

    def test_correction_preserves_independent_gps_approval_and_original_timestamps(
        self,
    ):
        visit = self.visit()
        self.post(f"visitas/pool/{visit.pk}/tomar/")
        gps = self.post(
            f"visitas/{visit.pk}/excepciones/",
            {
                "type": "location",
                "scope": "arrival",
                "failure": "denied",
                "reason": "GPS permission unavailable on device",
                "evidenceId": self.arrival_photo(visit),
            },
        )
        self.assertEqual(gps.status_code, 200, gps.data)
        self.open(visit)
        _, draft = self.draft(visit)
        self.expire(visit)
        timed = self.historical_exception(
            visit,
            {"type": "time_limit", "reason": "Session expired during image upload"},
        )
        visit.refresh_from_db()
        body = {"revision": visit.borrador_revision}
        self.assertEqual(
            self.post(f"visitas/{visit.pk}/enviar-revision/", body).status_code, 200
        )
        self.login_as("account")
        self.post(
            f"visitas/{visit.pk}/revisar/",
            {
                "exceptionId": gps.data["exceptions"][0]["id"],
                "approved": True,
                "reason": "Confirmed unavailable GPS with evidence",
            },
        )
        rejected = self.post(
            f"visitas/{visit.pk}/revisar/",
            {
                "exceptionId": timed.data["exceptions"][-1]["id"],
                "approved": False,
                "reason": "Explain the delay in more detail",
            },
        )
        self.assertEqual(rejected.data["workStatus"], "correction_required")
        self.login_as("tech")
        corrected = self.post(
            f"visitas/{visit.pk}/borrador/",
            {
                **draft,
                "revision": body["revision"],
                "workDescription": "More precise technical description",
            },
        )
        self.assertEqual(corrected.status_code, 200, corrected.data)
        self.assertEqual(corrected.data["submittedAt"], rejected.data["submittedAt"])
        self.assertTrue(corrected.data["exceptions"][0]["approved"])
        self.assertEqual(corrected.data["exceptions"][0]["revision"], 0)
        self.assertEqual(
            self.post(
                f"visitas/{visit.pk}/excepciones/",
                {
                    "type": "time_limit",
                    "reason": "Recovered after a documented network outage",
                    "revision": 0,
                },
            ).status_code,
            200,
        )
        self.assertEqual(
            self.post(
                f"visitas/{visit.pk}/enviar-revision/",
                {"revision": corrected.data["revision"]},
            ).status_code,
            200,
        )
        self.login_as("account")
        accepted = self.post(
            f"visitas/{visit.pk}/revisar/",
            {
                "exceptionId": timed.data["exceptions"][-1]["id"],
                "approved": True,
                "reason": "Reviewed corrected delay justification",
            },
        )
        self.assertEqual(accepted.data["workStatus"], "finished")
        for key in ("startedAt", "physicalEndedAt", "formOpenedAt", "expiresAt"):
            self.assertEqual(accepted.data[key], rejected.data[key])
        self.assertEqual(visit.eventos.filter(tipo="review").count(), 3)

    def test_photo_snapshot_and_item_association_remain_authoritative(self):
        required = ItemPlantilla.objects.create(
            plantilla=self.template,
            descripcion="Second required task",
            foto_obligatoria=True,
            orden=2,
        )
        optional = ItemPlantilla.objects.create(
            plantilla=self.template,
            descripcion="Optional photo task",
            foto_obligatoria=False,
            orden=3,
        )
        visit = self.visit()
        # Cambiar la plantilla no reescribe los requisitos del intento histórico.
        self.item.foto_obligatoria = False
        self.item.save(update_fields=["foto_obligatoria"])
        self.start(visit)
        self.open(visit)
        upload = self.upload(visit)
        self.assertEqual(upload.status_code, 201, upload.data)
        photo_id = upload.data["id"]
        retrieved = self.client.get(f"/api/visitas/{visit.pk}/")
        tasks = {task["id"]: task for task in retrieved.data["tasks"]}
        self.assertTrue(tasks[self.item.pk]["photoRequired"])
        self.assertTrue(tasks[required.pk]["photoRequired"])
        self.assertFalse(tasks[optional.pk]["photoRequired"])
        answers = [
            {
                "taskId": self.item.pk,
                "result": "conforme",
                "observation": "",
                "evidenceIds": [photo_id],
            },
            {
                "taskId": required.pk,
                "result": "conforme",
                "observation": "",
                "evidenceIds": [photo_id],
            },
            {
                "taskId": optional.pk,
                "result": "conforme",
                "observation": "",
                "evidenceIds": [],
            },
        ]

        def save():
            visit.refresh_from_db()
            return self.post(
                f"visitas/{visit.pk}/borrador/",
                {
                    "revision": visit.borrador_revision,
                    "answers": answers,
                    "workDescription": "",
                    "evidenceIds": [],
                },
            )

        # Una foto del primer ítem no puede satisfacer el requisito del segundo.
        self.assertEqual(save().status_code, 400)
        answers[1]["evidenceIds"] = []
        saved = save()
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(self.post(f"visitas/{visit.pk}/finalizar/").status_code, 400)
        answers[1].update(
            result="no_aplica", observation="Este equipo no existe en la tienda."
        )
        saved = save()
        self.assertEqual(saved.status_code, 200, saved.data)
        confirmed = self.post(f"visitas/{visit.pk}/finalizar/")
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        self.assertEqual(confirmed.data["status"], "completed")
        associations = {
            answer["taskId"]: answer["evidenceIds"]
            for answer in confirmed.data["answers"]
        }
        self.assertEqual(associations[self.item.pk], [photo_id])
        self.assertEqual(associations[required.pk], [])
        self.assertEqual(associations[optional.pk], [])

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
            self.assertEqual(
                self.post(
                    f"visitas/{visit.pk}/iniciar/", {"location": gps}
                ).status_code,
                400,
            )
        self.assertEqual(self.start(visit).status_code, 200)
        self.assertEqual(
            self.post(f"visitas/{visit.pk}/finalizar/", {}).status_code, 409
        )
        self.open(visit)
        self.assertEqual(
            self.post(f"visitas/{visit.pk}/finalizar/", {}).status_code, 400
        )

    def test_registration_without_deadline_and_historical_expiry_does_not_block_submission(
        self,
    ):
        for origin in ("checklist", "ticket"):
            visit = self.visit(origin)
            self.start(visit)
            self.open(visit)
            self.draft(visit)
            self.expire(visit)  # Vencimiento histórico, conservado pero no exigible.
            visit.refresh_from_db()
            deadline = visit.formulario_vence_en
            response = self.post(f"visitas/{visit.pk}/finalizar/", {})
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["expiresAt"], deadline.isoformat())
            self.assertGreater(response.data["registrationSeconds"], 300)
            self.assertFalse(visit.excepciones.exists())

    def test_foreign_resource_permissions(self):
        visit = self.visit()
        self.start(visit)
        self.open(visit)
        evidence_id, _ = self.draft(visit)
        self.login_as("othertech")
        self.assertEqual(self.client.get(f"/api/visitas/{visit.pk}/").status_code, 404)
        self.assertEqual(self.post(f"visitas/{visit.pk}/formulario/").status_code, 404)
        self.assertEqual(
            self.client.get(f"/api/evidencias/{evidence_id}/archivo/").status_code, 404
        )
        self.assertEqual(
            self.client.delete(f"/api/evidencias/{evidence_id}/").status_code, 404
        )
        self.assertEqual(self.post("admin/clientes/", {"name": "x"}).status_code, 403)
        self.login_as("outsider")
        self.assertEqual(self.client.get(f"/api/visitas/{visit.pk}/").status_code, 404)
        self.assertEqual(
            self.client.get(f"/api/evidencias/{evidence_id}/").status_code, 404
        )
        self.login_as("account")
        self.assertEqual(
            self.client.get(f"/api/evidencias/{evidence_id}/archivo/").status_code, 200
        )

    def test_upload_validation_retry_and_closed_protection(self):
        visit = self.visit()
        self.start(visit)
        self.open(visit)
        evidence_id = str(uuid.uuid4())
        self.assertEqual(self.upload(visit, evidence_id).status_code, 201)
        self.assertEqual(self.upload(visit, evidence_id).status_code, 200)
        self.assertEqual(Evidencia.objects.count(), 1)
        invalid = {
            "id": str(uuid.uuid4()),
            "foto": SimpleUploadedFile(
                "file.jpg", b"not an image", content_type="image/jpeg"
            ),
            "source": "gallery",
            "capturedAt": timezone.now().isoformat(),
            "visitId": visit.pk,
            "taskId": self.item.pk,
        }
        self.assertEqual(
            self.client.post(
                "/api/evidencias/", invalid, format="multipart"
            ).status_code,
            400,
        )
        self.post(
            f"visitas/{visit.pk}/borrador/",
            {
                "revision": 1,
                "answers": [
                    {
                        "taskId": self.item.pk,
                        "result": "conforme",
                        "observation": "",
                        "evidenceIds": [evidence_id],
                    }
                ],
                "workDescription": "",
                "evidenceIds": [],
            },
        )
        self.post(f"visitas/{visit.pk}/finalizar/", {})
        self.assertEqual(
            self.client.delete(f"/api/evidencias/{evidence_id}/").status_code, 409
        )
        self.assertEqual(self.upload(visit).status_code, 409)
        # Una evidencia histórica puede estar asociada solo mediante checklist.
        Evidencia.objects.filter(client_id=evidence_id).update(visita=None)
        self.assertEqual(
            self.client.delete(f"/api/evidencias/{evidence_id}/").status_code, 409
        )
        Evidencia.objects.filter(client_id=evidence_id).update(
            foto="missing-test-file.jpg"
        )
        self.assertEqual(
            self.client.get(f"/api/evidencias/{evidence_id}/archivo/").status_code, 404
        )

    def test_ticket_creation_scheduling_reassignment(self):
        self.login_as("store")
        file_id = str(uuid.uuid4())
        temporary = self.client.post(
            "/api/evidencias/",
            {"id": file_id, "foto": image_file(), "source": "upload"},
            format="multipart",
        )
        self.assertEqual(temporary.status_code, 201)
        self.assertEqual(self.client.get("/api/evidencias/").data[0]["id"], file_id)
        body = {
            "storeId": self.store.pk,
            "categoryId": self.category.pk,
            "priorityId": self.urgency.pk,
            "description": "Broken refrigeration unit needs maintenance",
            "evidenceIds": [file_id],
        }
        key = str(uuid.uuid4())
        ticket_response = self.post("tickets/", body, key)
        self.assertEqual(ticket_response.status_code, 201, ticket_response.data)
        self.assertEqual(
            self.post("tickets/", body, key).data["id"], ticket_response.data["id"]
        )
        self.assertEqual(Ticket.objects.count(), 1)
        self.assertEqual(self.client.get("/api/evidencias/").data, [])
        self.login_as("account")
        self.assertEqual(self.client.get("/api/evidencias/").status_code, 403)
        pk = ticket_response.data["id"]
        scheduled = {
            "technicianId": self.users["tech"].pk,
            "scheduledAt": (timezone.now() + timedelta(hours=1)).isoformat(),
            "priorityId": self.urgency.pk,
            "reason": "",
            "revision": 0,
        }
        first = self.post(f"tickets/{pk}/programar/", scheduled)
        self.assertEqual(first.status_code, 200, first.data)
        old_visit = first.data["visitId"]
        scheduled.update(
            technicianId=self.users["othertech"].pk,
            revision=1,
            reason="Technician availability changed",
        )
        second = self.post(f"tickets/{pk}/programar/", scheduled)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(
            Visita.objects.filter(ticket_origen_id=pk, vigente=True).count(), 1
        )
        self.assertEqual(len(second.data["history"]), 4)
        self.login_as("tech")
        self.assertEqual(self.client.get(f"/api/visitas/{old_visit}/").status_code, 404)
        self.assertEqual(
            self.post(
                f"visitas/{old_visit}/iniciar/", {"location": self.gps()}
            ).status_code,
            404,
        )
        self.login_as("othertech")
        current = Visita.objects.get(pk=second.data["visitId"])
        with patch("core.services.timezone.now", return_value=current.fecha_programada):
            self.assertEqual(self.start(current).status_code, 200)
        self.login_as("account")
        scheduled.update(technicianId=self.users["tech"].pk, revision=2)
        for state in ("en_proceso", "pendiente_validacion", "resuelto", "cerrado"):
            Ticket.objects.filter(pk=pk).update(estado=state)
            denied = self.post(f"tickets/{pk}/programar/", scheduled)
            self.assertEqual(denied.status_code, 409, denied.data)
            self.assertEqual(
                Visita.objects.filter(ticket_origen_id=pk, vigente=True).count(), 1
            )
            current.refresh_from_db()
            self.assertEqual(current.tecnico_id, self.users["othertech"].pk)
        self.assertEqual(ReasignacionTicket.objects.filter(ticket_id=pk).count(), 2)

    def test_client_legal_name_is_validated_and_persistent(self):
        self.login_as("admin")
        payload = {
            "name": "Legal company name",
            "taxId": "CLIENT-LEGAL",
            "email": "contact@test.invalid",
        }
        created = self.post("admin/clientes/", payload)
        self.assertEqual(created.status_code, 201, created.data)
        pk = created.data["id"]
        path = f"/api/admin/clientes/{pk}/"

        def edit_client(data):
            return self.client.patch(
                path, data, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())
            )

        self.assertEqual(set(created.data), {"id", "name", "taxId", "email"})
        self.assertEqual(self.client.get(path).data["name"], payload["name"])
        changed = edit_client({"name": "Updated legal company name"})
        self.assertEqual(changed.status_code, 200, changed.data)
        record = Cliente.objects.get(pk=pk)
        self.assertEqual(record.razon_social, "Updated legal company name")
        self.assertEqual(
            edit_client({"email": "other@test.invalid"}).data["name"],
            record.razon_social,
        )
        for invalid in ("x" * 201, None, {}, ""):
            rejected = edit_client({"name": invalid})
            self.assertEqual(rejected.status_code, 400, rejected.data)
            self.assertIn("name", rejected.data)
            self.assertEqual(
                Cliente.objects.get(pk=pk).razon_social, record.razon_social
            )
        without_email = self.post(
            "admin/clientes/",
            {
                "name": "Another legal company name",
                "taxId": "CLIENT-NO-EMAIL",
                "email": "",
            },
        )
        self.assertEqual(without_email.status_code, 201, without_email.data)
        self.assertEqual(set(without_email.data), {"id", "name", "taxId", "email"})
        self.login_as("store")
        self.assertEqual(edit_client({"name": "Not authorized"}).status_code, 403)

    def test_admin_credentials_assignments_and_template_snapshot(self):
        visit = self.visit()
        original = visit.checklist.tareas_snapshot
        self.login_as("admin")
        payload = {
            "username": "newtech",
            "name": "New Technician",
            "email": "newtech@test.invalid",
            "role": "technician",
            "active": True,
            "coverages": [
                {"clientId": self.store.cliente_id, "zoneId": self.store.zona_id}
            ],
            "password": PASSWORD,
        }
        response = self.post("admin/usuarios/", payload)
        self.assertEqual(response.status_code, 201, response.data)
        user = Usuario.objects.get(pk=response.data["id"])
        self.assertTrue(user.check_password(PASSWORD))
        self.assertFalse(user.password_initialized)
        self.assertTrue(
            CoberturaUsuario.objects.filter(
                usuario=user,
                cliente=self.store.cliente,
                zona=self.store.zona,
                activo=True,
            ).exists()
        )
        payload["username"] = "weakuser"
        payload["password"] = "12345678"
        self.assertEqual(self.post("admin/usuarios/", payload).status_code, 400)
        template = {
            "name": "Updated template",
            "active": True,
            "version": 2,
            "tasks": [
                {
                    "id": self.item.pk,
                    "title": "Changed task title",
                    "photoRequired": False,
                    "active": True,
                    "order": 1,
                }
            ],
        }
        response = self.client.put(
            f"/api/admin/plantillas/{self.template.pk}/",
            template,
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        self.assertEqual(response.status_code, 200, response.data)
        visit.checklist.refresh_from_db()
        self.assertEqual(visit.checklist.tareas_snapshot, original)
        self.assertEqual(
            self.client.delete(
                f"/api/admin/plantillas/{self.template.pk}/"
            ).status_code,
            409,
        )

    def test_auth_password_setup_refresh_and_logout(self):
        self.client.force_authenticate(None)
        self.assertEqual(
            self.client.post("/api/auth/login/", [], format="json").status_code, 400
        )
        self.assertEqual(
            self.client.post(
                "/api/auth/refresh/", {"refresh": {}}, format="json"
            ).status_code,
            400,
        )
        self.users["tech"].password_initialized = False
        self.users["tech"].save()
        response = self.client.post(
            "/api/auth/login/",
            {"username": "tech", "password": PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["role"], "technician")
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + response.data["access"])
        self.assertEqual(self.client.get("/api/checklists/").status_code, 403)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 200)
        self.assertEqual(
            self.client.post(
                "/api/auth/password/",
                {"password": {}, "confirmation": {}},
                format="json",
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                "/api/auth/password/",
                {"password": "12345678", "confirmation": "12345678"},
                format="json",
            ).status_code,
            400,
        )
        changed = self.client.post(
            "/api/auth/password/",
            {
                "password": "Stronger-than-first-2026!",
                "confirmation": "Stronger-than-first-2026!",
            },
            format="json",
        )
        self.assertEqual(changed.status_code, 200, changed.data)
        old_refresh = changed.data["refresh"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + changed.data["access"])
        refreshed = self.client.post(
            "/api/auth/refresh/", {"refresh": old_refresh}, format="json"
        )
        self.assertEqual(refreshed.status_code, 200)
        self.assertEqual(
            self.client.post(
                "/api/auth/refresh/", {"refresh": old_refresh}, format="json"
            ).status_code,
            401,
        )
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + refreshed.data["access"])
        self.assertEqual(
            self.client.post("/api/auth/logout/", {}, format="json").status_code, 204
        )
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)

    def test_time_and_gps_exceptions_are_independent(self):
        for origin in ("checklist", "ticket"):
            visit = self.visit(origin)
            self.start(visit)
            gps = self.historical_exception(
                visit,
                {
                    "type": "location",
                    "scope": "closure",
                    "failure": "denied",
                    "reason": "GPS permission unavailable at physical closure",
                },
            )
            self.assertEqual(gps.status_code, 200, gps.data)
            self.assertEqual(
                self.post(f"visitas/{visit.pk}/formulario/").status_code, 200
            )
            self.draft(visit)
            self.expire(visit)
            timed = self.historical_exception(
                visit,
                {"type": "time_limit", "reason": "Recovered after session expiration"},
            )
            visit.refresh_from_db()
            self.assertEqual(
                self.post(
                    f"visitas/{visit.pk}/enviar-revision/",
                    {"revision": visit.borrador_revision},
                ).status_code,
                200,
            )
            self.login_as("account")
            first = self.post(
                f"visitas/{visit.pk}/revisar/",
                {
                    "exceptionId": gps.data["exceptions"][0]["id"],
                    "approved": True,
                    "reason": "Reviewed complete content and GPS issue",
                },
            )
            self.assertEqual(first.data["status"], "pending_approval")
            second = self.post(
                f"visitas/{visit.pk}/revisar/",
                {
                    "exceptionId": timed.data["exceptions"][-1]["id"],
                    "approved": True,
                    "reason": "Reviewed complete content and delay issue",
                },
            )
            self.assertEqual(second.data["status"], "completed")
            self.assertIsNone(second.data["endLocation"]["latitude"])
            self.assertFalse(second.data["endLocation"]["validated"])
            self.assertEqual(visit.eventos.filter(tipo="review").count(), 2)
            self.login_as("tech")

    def test_time_approval_uses_previously_persisted_gps_and_cannot_replace_it(self):
        visit = self.visit()
        self.start(visit)
        self.open(visit)
        self.draft(visit)
        self.expire(visit)
        requested = self.historical_exception(
            visit,
            {"type": "time_limit", "reason": "Device powered off during registration"},
        )
        visit.refresh_from_db()
        original = visit.ubicacion_cierre
        self.post(
            f"visitas/{visit.pk}/enviar-revision/",
            {"revision": visit.borrador_revision},
        )
        self.assertEqual(self.close(visit).status_code, 200)
        self.login_as("account")
        approved = self.post(
            f"visitas/{visit.pk}/revisar/",
            {
                "exceptionId": requested.data["exceptions"][0]["id"],
                "approved": True,
                "reason": "Checked complete content and timing issue",
            },
        )
        self.assertEqual(approved.data["status"], "completed")
        self.assertEqual(approved.data["endLocation"], original)

    def test_database_constraints_and_report_scope(self):
        visit = self.visit()
        self.start(visit)
        visit.refresh_from_db()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Visita.objects.filter(pk=visit.pk).update(
                formulario_abierto_en=visit.iniciado_en - timedelta(seconds=1)
            )
        self.open(visit)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Visita.objects.filter(pk=visit.pk).update(
                formulario_vence_en=timezone.now() - timedelta(days=1)
            )
        self.draft(visit)
        self.post(f"visitas/{visit.pk}/finalizar/", {})
        self.contract.activo = False
        self.contract.save()
        self.login_as("account")
        period = timezone.localdate().replace(day=1).isoformat()
        dashboard = self.client.get("/api/dashboard/", {"period": period})
        self.assertEqual(dashboard.status_code, 200)
        self.assertEqual(dashboard.data["compliance"], 100)
        another_client = Cliente.objects.create(
            razon_social="Another authorized client", ruc="TEST-2"
        )
        another_zone = Zona.objects.create(
            cliente=another_client, nombre="Otra zona de pruebas"
        )
        Tienda.objects.create(
            cliente=another_client,
            zona=another_zone,
            nombre="Another store",
            direccion="Address",
            latitud="-12",
            longitud="-77",
        )
        CoberturaUsuario.objects.create(
            usuario=self.users["account"], cliente=another_client, zona=another_zone
        )
        filtered = self.client.get(
            "/api/dashboard/", {"period": period, "clientId": self.store.cliente_id}
        )
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual(filtered.data["compliance"], 100)
        self.assertEqual(
            {c["id"] for c in filtered.data["clients"]},
            {self.store.cliente_id, another_client.pk},
        )
        foreign_client = Cliente.objects.create(
            razon_social="Foreign client", ruc="FOREIGN"
        )
        self.assertEqual(
            self.client.get(
                "/api/dashboard/", {"period": period, "clientId": foreign_client.pk}
            ).status_code,
            403,
        )
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
        self.assertEqual(
            self.client.get(
                "/api/reportes/", {"period": period[:-2] + "20"}
            ).status_code,
            400,
        )
        self.login_as("outsider")
        self.assertEqual(
            self.client.get(
                "/api/reportes/", {"clientId": self.store.cliente_id}
            ).status_code,
            403,
        )

    def test_checklist_walkthrough_has_no_form_deadline_and_opens_after_gps(self):
        visit = self.visit()
        self.assertEqual(self.start(visit).status_code, 200)
        visit.refresh_from_db()
        self.assertEqual(visit.estado, "en_curso")
        self.assertIsNone(visit.formulario_abierto_en)
        self.assertIsNone(visit.formulario_vence_en)
        self.assertIsNone(visit.completado_en)
        self.assertEqual(visit.checklist.tareas_snapshot[0]["id"], self.item.pk)
        Visita.objects.filter(pk=visit.pk).update(
            iniciado_en=timezone.now() - timedelta(minutes=30)
        )
        opened = self.open(visit)
        self.assertEqual(opened.status_code, 200, opened.data)
        visit.refresh_from_db()
        self.assertIsNone(visit.formulario_vence_en)
        self.assertGreater(
            visit.formulario_abierto_en - visit.iniciado_en, timedelta(minutes=29)
        )
        self.assertIsNone(visit.ubicacion_cierre)
        self.assertTrue(visit.eventos.filter(tipo="physical_end").exists())
        self.assertIsNone(visit.enviado_en)
        self.assertIsNone(visit.completado_en)
        deadline = visit.formulario_vence_en
        self.assertEqual(self.post(f"visitas/{visit.pk}/formulario/").status_code, 200)
        visit.refresh_from_db()
        self.assertEqual(visit.formulario_vence_en, deadline)
        captured = timezone.now() - timedelta(minutes=20)
        response = self.client.post(
            "/api/evidencias/",
            {
                "id": str(uuid.uuid4()),
                "foto": image_file(),
                "source": "camera",
                "capturedAt": captured.isoformat(),
                "visitId": visit.pk,
                "taskId": self.item.pk,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Evidencia.objects.get(visita=visit).capturada_en, captured)

    def test_compatibility_close_route_ignores_gps_and_preserves_absence(self):
        visit = self.visit()
        self.start(visit)
        response = self.post(
            f"visitas/{visit.pk}/ubicacion-cierre/", {"location": {"latitude": 0}}
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data["physicalEndedAt"])
        self.assertIsNone(response.data["endLocation"])
        self.assertIsNone(response.data["formOpenedAt"])
        self.assertEqual(self.post(f"visitas/{visit.pk}/formulario/").status_code, 200)

    def test_new_closure_exception_is_not_required_or_created(self):
        visit = self.visit()
        self.start(visit)
        response = self.post(
            f"visitas/{visit.pk}/excepciones/",
            {
                "type": "location",
                "scope": "closure",
                "failure": "denied",
                "reason": "GPS permission unavailable after walkthrough",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(visit.excepciones.exists())
        self.assertEqual(self.close(visit).status_code, 200)
        self.assertEqual(self.post(f"visitas/{visit.pk}/formulario/").status_code, 200)

    def test_ticket_form_requires_its_own_physical_end_before_opening(self):
        visit = self.visit("ticket")
        self.start(visit)
        self.assertEqual(self.post(f"visitas/{visit.pk}/formulario/").status_code, 409)
        self.assertEqual(self.close(visit).status_code, 200)
        self.assertEqual(self.post(f"visitas/{visit.pk}/formulario/").status_code, 200)
        visit.refresh_from_db()
        self.assertIsNone(visit.ubicacion_cierre)
        self.assertIsNone(visit.formulario_vence_en)


class ConcurrencyTests(TransactionTestCase):
    def setUp(self):
        (
            self.users,
            self.store,
            self.template,
            self.item,
            self.contract,
            self.category,
            self.urgency,
        ) = fixtures()

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
        results = self.parallel(
            lambda client, name: client.post(
                "/api/checklists/generar/",
                {},
                format="json",
                HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            ).status_code,
            ["tech", "othertech"],
        )
        self.assertEqual(results, [200, 200])
        self.assertEqual(Visita.objects.count(), 3)
        self.assertEqual(Checklist.objects.count(), 3)
        self.assertEqual(
            list(Visita.objects.order_by("cuota").values_list("cuota", flat=True)),
            [1, 2, 3],
        )

    def test_claim_is_atomic(self):
        generate_month(self.users["tech"])
        visit = Visita.objects.get()
        results = self.parallel(
            lambda client, name: client.post(
                f"/api/visitas/pool/{visit.pk}/tomar/",
                {},
                format="json",
                HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            ).status_code,
            ["tech", "othertech"],
        )
        self.assertEqual(sorted(results), [200, 409])

    def test_expired_claim_concurrent_reclaim_has_one_release_and_one_owner(self):
        from .models import Evento

        generate_month(self.users["tech"])
        visit = Visita.objects.get()
        visit.tecnico = self.users["tech"]
        visit.reclamada_en = timezone.now() - timedelta(hours=2, minutes=1)
        visit.reclamo_vence_en = visit.reclamada_en + timedelta(hours=2)
        visit.save()
        results = self.parallel(
            lambda client, name: client.post(
                f"/api/visitas/pool/{visit.pk}/tomar/",
                {},
                format="json",
                HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            ).status_code,
            ["tech", "othertech"],
        )
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(
            Evento.objects.filter(visita=visit, tipo="claim_release").count(), 1
        )
        self.assertEqual(Evento.objects.filter(visita=visit, tipo="claim").count(), 1)
        visit.refresh_from_db()
        self.assertIn(
            visit.tecnico_id, [self.users["tech"].pk, self.users["othertech"].pk]
        )
        self.assertGreater(visit.reclamo_vence_en, timezone.now())

    def test_simultaneous_open_uses_first_deadline(self):
        generate_month(self.users["tech"])
        visit = Visita.objects.get()
        visit.tecnico = self.users["tech"]
        visit.iniciado_en = timezone.now() - timedelta(minutes=10)
        visit.estado = "en_curso"
        visit.terminado_en = timezone.now() - timedelta(seconds=1)
        from .gps import validate_gps

        visit.ubicacion_cierre = validate_gps(
            {
                "latitude": float(self.store.latitud),
                "longitude": float(self.store.longitud),
                "accuracy": 8,
                "capturedAt": timezone.now().timestamp() * 1000,
            },
            visit,
        )
        visit.save()
        results = self.parallel(
            lambda client, name: client.post(
                f"/api/visitas/{visit.pk}/formulario/",
                {},
                format="json",
                HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            ).data,
            ["tech", "tech"],
        )
        self.assertEqual(results[0]["expiresAt"], results[1]["expiresAt"])
        visit.refresh_from_db()
        self.assertIsNone(visit.formulario_vence_en)

    def running(self):
        generate_month(self.users["tech"])
        visit = Visita.objects.get()
        opened = timezone.now()
        visit.tecnico = self.users["tech"]
        visit.iniciado_en = opened - timedelta(minutes=8)
        visit.terminado_en = opened
        from .gps import validate_gps

        visit.ubicacion_cierre = validate_gps(
            {
                "latitude": float(self.store.latitud),
                "longitude": float(self.store.longitud),
                "accuracy": 8,
                "capturedAt": timezone.now().timestamp() * 1000,
            },
            visit,
        )
        visit.formulario_abierto_en = opened
        visit.formulario_vence_en = opened + timedelta(minutes=5)
        visit.estado = "en_curso"
        visit.save()
        return visit

    def test_concurrent_drafts_cannot_overwrite_same_revision(self):
        visit = self.running()
        body = {
            "revision": 0,
            "answers": [
                {
                    "taskId": self.item.pk,
                    "result": "conforme",
                    "observation": "",
                    "evidenceIds": [],
                }
            ],
            "workDescription": "",
            "evidenceIds": [],
        }
        results = self.parallel(
            lambda client, name: client.post(
                f"/api/visitas/{visit.pk}/borrador/",
                body,
                format="json",
                HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            ).status_code,
            ["tech", "tech"],
        )
        self.assertEqual(sorted(results), [200, 409])
        visit.refresh_from_db()
        self.assertEqual(visit.borrador_revision, 1)
        self.assertEqual(RespuestaItem.objects.count(), 1)

    def test_concurrent_upload_same_uuid_has_one_file(self):
        visit = self.running()
        evidence_id = str(uuid.uuid4())

        def upload(client, name):
            return client.post(
                "/api/evidencias/",
                {
                    "id": evidence_id,
                    "foto": image_file(),
                    "source": "gallery",
                    "visitId": visit.pk,
                    "taskId": self.item.pk,
                },
                format="multipart",
            ).status_code

        self.assertEqual(sorted(self.parallel(upload, ["tech", "tech"])), [200, 201])
        self.assertEqual(Evidencia.objects.count(), 1)

    def test_concurrent_finalization_is_one_accepted_event(self):
        visit = self.running()
        Evidencia.objects.create(
            visita=visit,
            checklist=visit.checklist,
            item=self.item,
            autor=self.users["tech"],
            foto=image_file(),
        )
        RespuestaItem.objects.create(
            checklist=visit.checklist, item=self.item, resultado="ok"
        )
        results = self.parallel(
            lambda client, name: client.post(
                f"/api/visitas/{visit.pk}/finalizar/",
                {"revision": 0},
                format="json",
                HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            ).data,
            ["tech", "tech"],
        )
        self.assertEqual(results[0]["completedAt"], results[1]["completedAt"])
        self.assertEqual(visit.eventos.filter(tipo="complete").count(), 1)

    def test_concurrent_ticket_creation_same_key_is_one_record(self):
        key = str(uuid.uuid4())
        body = {
            "storeId": self.store.pk,
            "categoryId": self.category.pk,
            "priorityId": self.urgency.pk,
            "description": "Reported electrical fault in test store",
            "evidenceIds": [],
        }
        results = self.parallel(
            lambda client, name: client.post(
                "/api/tickets/", body, format="json", HTTP_IDEMPOTENCY_KEY=key
            ).data,
            ["store", "store"],
        )
        self.assertEqual(results[0]["id"], results[1]["id"])
        self.assertEqual(Ticket.objects.count(), 1)

    def test_concurrent_scheduling_checks_revision_and_one_visit(self):
        ticket = Ticket.objects.create(
            tienda=self.store,
            categoria=self.category,
            urgencia=self.urgency,
            reportado_por=self.users["store"],
            descripcion="Reported electrical fault",
        )
        body = {
            "technicianId": self.users["tech"].pk,
            "scheduledAt": (timezone.now() + timedelta(hours=1)).isoformat(),
            "priorityId": self.urgency.pk,
            "reason": "",
            "revision": 0,
        }
        results = self.parallel(
            lambda client, name: client.post(
                f"/api/tickets/{ticket.pk}/programar/",
                body,
                format="json",
                HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            ).status_code,
            ["account", "account"],
        )
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(
            Visita.objects.filter(ticket_origen=ticket, vigente=True).count(), 1
        )

    def test_start_and_reassignment_cannot_both_win(self):
        from .generation import snapshot

        ticket = Ticket.objects.create(
            tienda=self.store,
            categoria=self.category,
            urgencia=self.urgency,
            reportado_por=self.users["store"],
            tecnico_asignado=self.users["tech"],
            estado="programado",
            descripcion="Reported issue",
        )
        visit = Visita(
            tienda=self.store,
            origen="ticket",
            tecnico=self.users["tech"],
            ticket_origen=ticket,
            fecha_programada=timezone.now() - timedelta(seconds=1),
        )
        snapshot(visit, self.contract)
        visit.save()
        gps = {
            "latitude": float(self.store.latitud),
            "longitude": float(self.store.longitud),
            "accuracy": 8,
            "capturedAt": timezone.now().timestamp() * 1000,
        }
        body = {
            "technicianId": self.users["othertech"].pk,
            "scheduledAt": (timezone.now() + timedelta(hours=2)).isoformat(),
            "priorityId": self.urgency.pk,
            "reason": "Technician replacement before work begins",
            "revision": 0,
        }

        def race(client, name):
            path, data = (
                (f"/api/visitas/{visit.pk}/iniciar/", {"location": gps})
                if name == "tech"
                else (f"/api/tickets/{ticket.pk}/programar/", body)
            )
            return client.post(
                path, data, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())
            ).status_code

        results = self.parallel(race, ["tech", "account"])
        self.assertIn(results, ([200, 409], [404, 200]))
        self.assertEqual(
            Visita.objects.filter(ticket_origen=ticket, vigente=True).count(), 1
        )
        ticket.refresh_from_db()
        active = Visita.objects.get(ticket_origen=ticket, vigente=True)
        self.assertEqual(active.tecnico_id, ticket.tecnico_asignado_id)
        self.assertEqual(active.estado == "en_curso", results[0] == 200)

    def test_concurrent_contracts_cannot_overlap(self):
        client = Cliente.objects.create(
            razon_social="Concurrent contract client", ruc="CONCURRENT"
        )
        body = {
            "clientId": client.pk,
            "templateId": self.template.pk,
            "startDate": timezone.localdate().isoformat(),
            "endDate": None,
            "monthlyVisits": 1,
            "monthlyInterventions": 2,
            "radiusMeters": 100,
            "active": True,
        }
        results = self.parallel(
            lambda api, name: api.post(
                "/api/admin/contratos/",
                body,
                format="json",
                HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            ).status_code,
            ["admin", "admin"],
        )
        self.assertEqual(sorted(results), [201, 400])
        self.assertEqual(Contrato.objects.filter(cliente=client).count(), 1)
