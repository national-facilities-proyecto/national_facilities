"""Issue #18: flujo móvil simple, evidencia durable y conservación histórica."""

import uuid
from datetime import timedelta
from unittest.mock import patch

from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Evidencia, Excepcion, Visita
from .tests import IntegrationTests, image_file
from .serializers import visit_data


class P0Tests(TestCase):
    setUp = IntegrationTests.setUp
    login_as = IntegrationTests.login_as
    post = IntegrationTests.post
    gps = IntegrationTests.gps
    visit = IntegrationTests.visit
    start = IntegrationTests.start
    close = IntegrationTests.close
    open = IntegrationTests.open
    upload = IntegrationTests.upload
    draft = IntegrationTests.draft
    arrival_photo = IntegrationTests.arrival_photo
    historical_exception = IntegrationTests.historical_exception

    def arrival(self, visit, **data):
        self.post(f"visitas/pool/{visit.pk}/tomar/")
        photo = self.arrival_photo(visit)
        result = self.post(
            f"visitas/{visit.pk}/excepciones/",
            {
                "type": "location",
                "scope": "arrival",
                "reason": "No fue posible confirmar la ubicación del establecimiento.",
                "failure": "unavailable",
                "evidenceId": photo,
                **data,
            },
        )
        self.assertEqual(result.status_code, 200, result.data)
        return photo, result

    def test_valid_arrival_never_requires_a_photo(self):
        visit = self.visit()
        response = self.start(visit)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["startLocation"]["validated"])
        self.assertEqual(response.data["arrivalEvidenceIds"], [])
        self.assertFalse(visit.excepciones.exists())
        self.assertFalse(visit.archivos.exists())

    def test_new_arrival_exception_requires_camera_photo_and_reason(self):
        visit = self.visit()
        self.post(f"visitas/pool/{visit.pk}/tomar/")
        payload = {
            "type": "location",
            "scope": "arrival",
            "reason": "GPS no disponible al llegar.",
            "failure": "denied",
        }
        self.assertEqual(
            self.post(f"visitas/{visit.pk}/excepciones/", payload).status_code, 400
        )
        gallery = self.client.post(
            "/api/evidencias/",
            {
                "id": str(uuid.uuid4()),
                "foto": image_file(),
                "source": "gallery",
                "purpose": "arrival",
                "capturedAt": timezone.now().isoformat(),
                "visitId": visit.pk,
            },
            format="multipart",
        )
        self.assertEqual(gallery.status_code, 400)
        photo = self.arrival_photo(visit)
        self.assertEqual(
            self.post(
                f"visitas/{visit.pk}/excepciones/",
                {**payload, "evidenceId": photo, "reason": "corto"},
            ).status_code,
            400,
        )
        visit.refresh_from_db()
        self.assertIsNone(visit.iniciado_en)
        self.assertFalse(visit.excepciones.exists())

    def test_camera_photo_recovery_author_timestamp_context_and_idor(self):
        visit = self.visit()
        self.post(f"visitas/pool/{visit.pk}/tomar/")
        photo = self.arrival_photo(visit)
        second = APIClient()
        second.force_authenticate(self.users["tech"])
        recovered = second.get(f"/api/visitas/{visit.pk}/")
        self.assertEqual(recovered.data["arrivalEvidenceIds"], [photo])
        metadata = second.get(f"/api/evidencias/{photo}/").data
        self.assertEqual(metadata["authorId"], self.users["tech"].pk)
        self.assertEqual(metadata["purpose"], "arrival")
        self.assertIsNotNone(metadata["uploadedAt"])
        self.assertIsNotNone(metadata["capturedAt"])
        self.assertEqual(
            second.get(f"/api/evidencias/{photo}/archivo/").status_code, 200
        )
        payload = {
            "type": "location",
            "scope": "arrival",
            "reason": "No hay señal GPS dentro del local.",
            "failure": "unavailable",
            "evidenceId": photo,
        }
        result = self.post(f"visitas/{visit.pk}/excepciones/", payload)
        self.assertEqual(result.status_code, 200)
        self.assertFalse(result.data["startLocation"]["validated"])
        self.assertIsNone(result.data["startLocation"]["latitude"])
        self.assertEqual(result.data["exceptions"][0]["evidenceIds"], [photo])
        self.assertEqual(
            Evidencia.objects.get(client_id=photo).excepcion_id,
            visit.excepciones.get().pk,
        )
        self.assertEqual(
            self.client.delete(f"/api/evidencias/{photo}/").status_code, 409
        )
        self.login_as("othertech")
        self.assertEqual(
            self.client.get(f"/api/evidencias/{photo}/archivo/").status_code, 404
        )
        self.login_as("store")
        self.assertEqual(self.client.get(f"/api/evidencias/{photo}/").status_code, 404)
        self.login_as("account")
        self.assertEqual(
            self.client.get(f"/api/evidencias/{photo}/archivo/").status_code, 200
        )

    def test_outside_real_reading_is_distinct_from_device_failure(self):
        visit = self.visit()
        reading = {**self.gps(), "latitude": float(self.store.latitud) + 0.02}
        _, response = self.arrival(visit, location=reading, failure="denied")
        telemetry = response.data["startLocation"]
        self.assertEqual(telemetry["failure"], "out_of_radius")
        self.assertEqual(telemetry["latitude"], reading["latitude"])
        self.assertGreater(telemetry["distanceMeters"], telemetry["radiusMeters"])
        self.assertFalse(telemetry["validated"])

    def test_stale_and_inaccurate_readings_allow_photo_exception_without_faking_presence(
        self,
    ):
        visit = self.visit()
        for failure, reading in [
            ("stale", {**self.gps(), "capturedAt": 0}),
            ("low_accuracy", {**self.gps(), "accuracy": 150}),
        ]:
            _, response = self.arrival(visit, location=reading, failure="")
            self.assertEqual(response.data["startLocation"]["failure"], failure)
            self.assertFalse(response.data["startLocation"]["validated"])
            self.assertEqual(
                self.post(
                    f"visitas/{visit.pk}/no-realizada/",
                    {"reason": "No fue posible completar el intento."},
                ).status_code,
                200,
            )
            if failure == "stale":
                visit = Visita.objects.get(intento_anterior=visit)

    def test_finish_without_gps_is_idempotent_audited_and_keeps_historical_closure(
        self,
    ):
        visit = self.visit()
        self.start(visit)
        old = {
            **self.gps(),
            "validated": True,
            "distanceMeters": 2,
            "radiusMeters": 100,
        }
        Visita.objects.filter(pk=visit.pk).update(
            ubicacion_cierre=old,
            latitud_cierre=self.store.latitud,
            longitud_cierre=self.store.longitud,
            proximidad_validada=True,
        )
        with patch(
            "core.services.validate_gps",
            side_effect=AssertionError("No debe leer GPS de salida"),
        ):
            ended = self.close(visit)
            repeated = self.close(visit)
        self.assertEqual(ended.status_code, 200)
        self.assertEqual(
            repeated.data["physicalEndedAt"], ended.data["physicalEndedAt"]
        )
        self.assertEqual(repeated.data["endLocation"], old)
        self.assertEqual(visit.eventos.filter(tipo="physical_end").count(), 1)
        self.assertNotIn("location", visit.eventos.get(tipo="physical_end").datos)
        visit.refresh_from_db()
        self.assertEqual(float(visit.latitud_cierre), float(self.store.latitud))
        self.assertTrue(visit.proximidad_validada)

    def test_form_is_unlimited_first_open_recoverable_and_real_duration_reported(self):
        visit = self.visit()
        self.start(visit)
        first = self.open(visit)
        self.assertIsNone(first.data["expiresAt"])
        self.assertEqual(
            self.open(visit).data["formOpenedAt"], first.data["formOpenedAt"]
        )
        self.draft(visit)
        opened = timezone.now() - timedelta(days=2)
        Visita.objects.filter(pk=visit.pk).update(
            iniciado_en=opened - timedelta(hours=1),
            terminado_en=opened - timedelta(seconds=1),
            formulario_abierto_en=opened,
        )
        expired = self.post(
            f"visitas/{visit.pk}/excepciones/",
            {"type": "time_limit", "reason": "El navegador estuvo cerrado dos días."},
        )
        self.assertEqual(expired.status_code, 400)
        completed = self.post(f"visitas/{visit.pk}/finalizar/")
        self.assertEqual(completed.status_code, 200, completed.data)
        self.assertGreater(completed.data["registrationSeconds"], 2 * 86400)
        self.assertIsNone(completed.data["endLocation"])
        self.assertFalse(visit.excepciones.exists())

    def test_rejection_correction_preserves_presence_photos_answers_and_original_events(
        self,
    ):
        visit = self.visit()
        photo, _ = self.arrival(visit)
        self.open(visit)
        result_photo, _ = self.draft(visit)
        visit.refresh_from_db()
        original = visit_data(visit)
        self.post(
            f"visitas/{visit.pk}/enviar-revision/",
            {"revision": visit.borrador_revision},
        )
        exc = visit.excepciones.get()
        self.login_as("account")
        rejected = self.post(
            f"visitas/{visit.pk}/revisar/",
            {
                "exceptionId": exc.pk,
                "approved": False,
                "reason": "Aclara el motivo y el establecimiento fotografiado.",
            },
        )
        self.assertEqual(rejected.data["phase"], "correction_required")
        self.login_as("tech")
        self.assertEqual(
            self.post(
                f"visitas/{visit.pk}/enviar-revision/",
                {"revision": visit.borrador_revision},
            ).status_code,
            400,
        )
        corrected = self.post(
            f"visitas/{visit.pk}/excepciones/",
            {
                "type": "location",
                "scope": "arrival",
                "reason": "La fachada corresponde al local asignado; falló el permiso GPS.",
                "revision": 0,
            },
        )
        self.assertEqual(corrected.status_code, 200)
        submitted = self.post(
            f"visitas/{visit.pk}/enviar-revision/",
            {"revision": visit.borrador_revision},
        )
        self.assertEqual(submitted.status_code, 200)
        for key in [
            "startedAt",
            "physicalEndedAt",
            "formOpenedAt",
            "answers",
            "startLocation",
        ]:
            self.assertEqual(submitted.data[key], original[key])
        self.login_as("account")
        approved = self.post(
            f"visitas/{visit.pk}/revisar/",
            {
                "exceptionId": exc.pk,
                "approved": True,
                "reason": "Se autoriza administrativamente el trabajo con presencia no validada.",
            },
        )
        self.assertEqual(approved.data["phase"], "finished")
        self.assertFalse(approved.data["startLocation"]["validated"])
        self.assertEqual(approved.data["exceptions"][0]["evidenceIds"], [photo])
        self.assertIn(result_photo, approved.data["answers"][0]["evidenceIds"])
        self.assertEqual(visit.eventos.filter(tipo="start").count(), 1)
        self.assertEqual(visit.eventos.filter(tipo="physical_end").count(), 1)

    def test_nf_can_decide_other_historical_pending_exceptions_after_one_rejection(
        self,
    ):
        visit = self.visit()
        self.start(visit)
        self.open(visit)
        self.draft(visit)
        self.historical_exception(
            visit,
            {
                "type": "location",
                "scope": "closure",
                "reason": "GPS histórico de cierre no disponible.",
            },
        )
        self.historical_exception(
            visit, {"type": "time_limit", "reason": "Demora histórica del registro."}
        )
        visit.refresh_from_db()
        self.post(
            f"visitas/{visit.pk}/enviar-revision/",
            {"revision": visit.borrador_revision},
        )
        self.login_as("account")
        closure = visit.excepciones.get(scope="closure")
        timed = visit.excepciones.get(tipo="time_limit")
        self.post(
            f"visitas/{visit.pk}/revisar/",
            {
                "exceptionId": closure.pk,
                "approved": False,
                "reason": "Se requiere aclarar el cierre histórico.",
            },
        )
        pending = self.client.get("/api/revisiones/pendientes/").data
        self.assertIn(visit.pk, [v["id"] for v in pending])
        decision = self.post(
            f"visitas/{visit.pk}/revisar/",
            {
                "exceptionId": timed.pk,
                "approved": True,
                "reason": "Se revisó la demora histórica documentada.",
            },
        )
        self.assertEqual(decision.status_code, 200)
        self.assertEqual(decision.data["phase"], "correction_required")
        self.assertEqual(self.client.get("/api/revisiones/pendientes/").data, [])


class P0MigrationTests(TransactionTestCase):
    def test_upgrade_keeps_historical_gps_deadline_exceptions_and_files(self):
        executor = MigrationExecutor(connection)
        self.addCleanup(
            lambda: MigrationExecutor(connection).migrate(
                MigrationExecutor(connection).loader.graph.leaf_nodes()
            )
        )
        before = [("core", "0018_operational_v2")]
        executor.migrate(before)
        apps = executor.loader.project_state(before).apps
        role = apps.get_model("core", "Rol").objects.create(nombre="Tecnico")
        user = apps.get_model("core", "Usuario").objects.create(
            username="p0-migration", rol=role
        )
        client = apps.get_model("core", "Cliente").objects.create(
            razon_social="Test client", ruc="P0-ONLY"
        )
        store = apps.get_model("core", "Tienda").objects.create(
            cliente=client, nombre="Test store", latitud=-12, longitud=-77
        )
        now = timezone.now()
        old_gps = {"latitude": -12, "longitude": -77, "accuracy": 8, "validated": True}
        visit = apps.get_model("core", "Visita").objects.create(
            tienda=store,
            tecnico=user,
            fecha_programada=now,
            iniciado_en=now - timedelta(hours=1),
            terminado_en=now - timedelta(minutes=10),
            formulario_abierto_en=now - timedelta(minutes=9),
            formulario_vence_en=now - timedelta(minutes=4),
            ubicacion_cierre=old_gps,
            estado="en_curso",
        )
        exc = apps.get_model("core", "Excepcion").objects.create(
            visita=visit,
            autor=user,
            tipo="time_limit",
            scope="form",
            motivo="Demora histórica original",
        )
        photo = apps.get_model("core", "Evidencia").objects.create(
            visita=visit, autor=user, foto="historical.webp"
        )
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        updated = Visita.objects.get(pk=visit.pk)
        self.assertEqual(updated.ubicacion_cierre, old_gps)
        self.assertEqual(updated.formulario_vence_en, visit.formulario_vence_en)
        self.assertEqual(Excepcion.objects.get(pk=exc.pk).motivo, exc.motivo)
        self.assertEqual(
            Evidencia.objects.get(pk=photo.pk).foto.name, "historical.webp"
        )
        self.assertEqual(Evidencia.objects.get(pk=photo.pk).proposito, "result")
        updated.formulario_vence_en = None
        updated.save(update_fields=["formulario_vence_en"])
        with self.assertRaises(IntegrityError), transaction.atomic():
            Visita.objects.filter(pk=updated.pk).update(
                formulario_vence_en=updated.formulario_abierto_en - timedelta(seconds=1)
            )
