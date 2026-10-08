"""Regresiones del motor V2; las carreras y migraciones usan PostgreSQL real."""

import uuid
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest.mock import Mock, patch

from django.db import IntegrityError, close_old_connections, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import SimpleTestCase, TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from .gps import evaluate_gps, validate_gps
from .models import (
    CoberturaUsuario,
    Evento,
    Excepcion,
    Ticket,
    Usuario,
    Visita,
)
from .generation import generate_month
from .serializers import exception_data, visit_data
from .services import request_or_correct_exception
from . import tests as legacy_tests
from .tests import fixtures


class GPSEvaluationTests(SimpleTestCase):
    def setUp(self):
        self.visit = Visita(
            radio_metros=100, tienda_snapshot={"latitude": -12.1, "longitude": -77.1}
        )
        self.now = timezone.now()
        self.gps = {
            "latitude": -12.1,
            "longitude": -77.1,
            "accuracy": 8,
            "capturedAt": self.now.timestamp() * 1000,
        }

    def test_fresh_normal_reading(self):
        result = validate_gps(self.gps, self.visit)
        self.assertTrue(result["validated"])
        self.assertEqual(result["distanceMeters"], 0)
        self.assertEqual(result["radiusMeters"], 100)

    def test_timestamp_boundaries(self):
        with patch("core.gps.timezone.now", return_value=self.now):
            for offset in (-60_000, 5_000):
                self.assertTrue(
                    evaluate_gps(
                        {**self.gps, "capturedAt": self.gps["capturedAt"] + offset},
                        self.visit,
                    )["validated"]
                )
            for offset, cause in ((-60_001, "stale"), (5_001, "future")):
                self.assertEqual(
                    evaluate_gps(
                        {**self.gps, "capturedAt": self.gps["capturedAt"] + offset},
                        self.visit,
                    )["failure"],
                    cause,
                )

    def test_accuracy_uses_published_radius_and_ceiling(self):
        for radius, maximum in ((30, 30), (150, 100)):
            self.visit.radio_metros = radius
            self.assertTrue(
                evaluate_gps({**self.gps, "accuracy": maximum}, self.visit)["validated"]
            )
            rejected = evaluate_gps({**self.gps, "accuracy": maximum + 1}, self.visit)
            self.assertEqual(rejected["failure"], "low_accuracy")
            self.assertEqual(rejected["accuracy"], maximum + 1)
            self.assertEqual(rejected["distanceMeters"], 0)

    def test_rejected_distance_keeps_real_coordinates(self):
        raw = {**self.gps, "latitude": -12.2}
        result = evaluate_gps(raw, self.visit)
        self.assertFalse(result["validated"])
        self.assertEqual(result["failure"], "out_of_radius")
        self.assertEqual(result["latitude"], raw["latitude"])
        self.assertGreater(result["distanceMeters"], 10_000)

    def test_device_failures_never_fabricate_coordinates(self):
        for cause in ("denied", "timeout", "unavailable"):
            result = evaluate_gps(None, self.visit, cause)
            self.assertEqual(result["failure"], cause)
            self.assertFalse(result["validated"])
            for key in (
                "latitude",
                "longitude",
                "accuracy",
                "capturedAt",
                "distanceMeters",
            ):
                self.assertIsNone(result[key])

    def test_partial_telemetry_is_preserved(self):
        result = evaluate_gps(
            {
                "latitude": -12.1,
                "longitude": -77.1,
                "capturedAt": self.gps["capturedAt"],
            },
            self.visit,
            "timeout",
        )
        self.assertEqual(result["latitude"], -12.1)
        self.assertEqual(result["distanceMeters"], 0)
        self.assertIsNone(result["accuracy"])
        self.assertFalse(result["validated"])

    def test_invalid_normal_readings_are_not_accepted(self):
        for key, value in (
            ("latitude", 91),
            ("longitude", 181),
            ("accuracy", -1),
            ("accuracy", True),
            ("capturedAt", "now"),
        ):
            with self.subTest(key=key, value=value), self.assertRaises(ValidationError):
                validate_gps({**self.gps, key: value}, self.visit)


class GPSFailureCorrectionTests(SimpleTestCase):
    """Ejercita la corrección y auditoría reales, aislando solo consultas/escrituras ORM."""

    def setUp(self):
        now = timezone.now()
        started = now - timedelta(hours=1)
        ended = started + timedelta(minutes=20)
        opened = ended + timedelta(minutes=1)
        self.user = Usuario(pk=7)
        self.visit = Visita(
            pk=20,
            tecnico=self.user,
            estado="correccion_requerida",
            iniciado_en=started,
            terminado_en=ended,
            formulario_abierto_en=opened,
            formulario_vence_en=opened + timedelta(minutes=5),
            enviado_en=opened + timedelta(minutes=6),
            borrador_revision=3,
        )
        self.rows = {}
        for pk, kind, scope in (
            (1, "location", "arrival"),
            (2, "location", "closure"),
            (3, "time_limit", "form"),
        ):
            telemetry = (
                None
                if kind == "time_limit"
                else {
                    "latitude": -12.1,
                    "longitude": -77.1,
                    "accuracy": 12,
                    "capturedAt": (started if scope == "arrival" else ended).timestamp()
                    * 1000,
                    "distanceMeters": 0,
                    "radiusMeters": 100,
                    "validated": False,
                    "failure": "denied",
                }
            )
            self.rows[scope] = Excepcion(
                pk=pk,
                visita=self.visit,
                tipo=kind,
                scope=scope,
                autor=self.user,
                motivo="Actual GPS or registration failure explained",
                fallo="denied" if telemetry else "",
                telemetria=telemetry,
                decision="approved",
                revision=4,
                solicitada_en=opened,
                revisor_id=9,
                revisada_en=now - timedelta(minutes=5),
                motivo_decision="Previously approved by NF",
            )
        # Otro rechazo explica el estado Corrección requerida sin invalidar las tres aprobaciones.
        self.rows["legacy"] = Excepcion(
            pk=4,
            visita=self.visit,
            tipo="location",
            scope="legacy",
            autor=self.user,
            motivo="Historical exception of unknown stage",
            fallo="denied",
            decision="rejected",
        )
        self.visit.ubicacion_inicio = deepcopy(self.rows["arrival"].telemetria)
        self.visit.ubicacion_cierre = deepcopy(self.rows["closure"].telemetria)
        self.original_exceptions = {
            scope: deepcopy(exception_data(row)) for scope, row in self.rows.items()
        }
        fields = (
            "iniciado_en",
            "terminado_en",
            "formulario_abierto_en",
            "formulario_vence_en",
            "enviado_en",
            "completado_en",
            "ubicacion_inicio",
            "ubicacion_cierre",
            "estado",
            "borrador_revision",
        )
        self.original_visit = {
            field: deepcopy(getattr(self.visit, field)) for field in fields
        }

    def correct(self, scope, failure=None):
        row = self.rows[scope]
        data = {
            "type": row.tipo,
            "scope": scope,
            "reason": row.motivo,
            "revision": row.revision,
        }
        if failure is not None:
            data["failure"] = failure
        events = []

        def capture_event(actor, visit, kind, text, payload):
            events.append({"kind": kind, "data": deepcopy(payload)})

        with patch.object(
            type(self.visit.excepciones),
            "filter",
            return_value=Mock(first=Mock(return_value=row)),
        ) as lookup, patch.object(Excepcion, "save") as save, patch(
            "core.services.event", side_effect=capture_event
        ), patch(
            "core.services.evaluate_gps"
        ) as evaluate:
            result = request_or_correct_exception(self.user, self.visit, data)
            lookup.assert_called_once_with(tipo=row.tipo, scope=scope)
            evaluate.assert_not_called()
        return result, save.call_count, events

    def assert_visit_unchanged(self):
        self.assertEqual(
            {field: getattr(self.visit, field) for field in self.original_visit},
            self.original_visit,
        )

    def assert_failure_correction(self, scope, failure):
        before = self.original_exceptions[scope]
        result, saves, events = self.correct(scope, failure)
        self.assertIs(result, self.rows[scope])
        self.assertEqual(
            (result.fallo, result.decision, result.revision),
            (failure, "pending", before["revision"] + 1),
        )
        self.assertEqual(result.telemetria, before["telemetry"])
        self.assertIsNone(result.revisor_id)
        self.assertIsNone(result.revisada_en)
        self.assertEqual(saves, 1)
        self.assertEqual(
            [e["kind"] for e in events], ["exception_previous", "exception_corrected"]
        )
        self.assertEqual(events[0]["data"]["exception"], before)
        self.assertEqual(
            events[0]["data"]["submittedAt"],
            self.original_visit["enviado_en"].isoformat(),
        )
        self.assertEqual(events[1]["data"]["exception"]["failure"], failure)
        self.assertIsNone(events[1]["data"]["exception"]["approved"])
        for other_scope, row in self.rows.items():
            if other_scope != scope:
                self.assertEqual(
                    exception_data(row), self.original_exceptions[other_scope]
                )
        self.assert_visit_unchanged()

    def test_arrival_failure_only_reopens_arrival_and_audits_approval(self):
        self.assert_failure_correction("arrival", "timeout")

    def test_closure_failure_only_reopens_closure_and_audits_approval(self):
        self.assert_failure_correction("closure", "unavailable")

    def test_identical_failure_and_data_are_neutral_for_both_gps_scopes(self):
        for scope in ("arrival", "closure"):
            with self.subTest(scope=scope):
                result, saves, events = self.correct(scope, "denied")
                self.assertEqual(
                    exception_data(result), self.original_exceptions[scope]
                )
                self.assertEqual(saves, 0)
                self.assertEqual(events, [])
        self.assert_visit_unchanged()

    def test_omitted_failure_keeps_corrected_cause_despite_historical_telemetry(self):
        self.correct("arrival", "timeout")
        corrected = deepcopy(exception_data(self.rows["arrival"]))
        result, saves, events = self.correct("arrival")
        self.assertEqual(exception_data(result), corrected)
        self.assertEqual(result.fallo, "timeout")
        self.assertEqual(saves, 0)
        self.assertEqual(events, [])
        self.assert_visit_unchanged()


class OperationalV2Tests(TestCase):
    # Comparte preparación y utilidades, sin heredar/duplicar los tests legacy.
    setUp = legacy_tests.IntegrationTests.setUp
    login_as = legacy_tests.IntegrationTests.login_as
    post = legacy_tests.IntegrationTests.post
    gps = legacy_tests.IntegrationTests.gps
    visit = legacy_tests.IntegrationTests.visit
    start = legacy_tests.IntegrationTests.start
    close = legacy_tests.IntegrationTests.close
    open = legacy_tests.IntegrationTests.open
    upload = legacy_tests.IntegrationTests.upload
    draft = legacy_tests.IntegrationTests.draft
    expire = legacy_tests.IntegrationTests.expire
    arrival_photo = legacy_tests.IntegrationTests.arrival_photo
    historical_exception = legacy_tests.IntegrationTests.historical_exception

    def exception(self, visit, scope, **overrides):
        payload = {
            "type": "location",
            "scope": scope,
            "failure": "unavailable",
            "reason": "GPS unavailable during this physical stage",
            **overrides,
        }
        visit.refresh_from_db()
        if scope == "arrival" and not visit.iniciado_en:
            payload["evidenceId"] = self.arrival_photo(visit)
        return self.post(f"visitas/{visit.pk}/excepciones/", payload)

    def submit(self, visit):
        visit.refresh_from_db()
        return self.post(
            f"visitas/{visit.pk}/enviar-revision/",
            {"revision": visit.borrador_revision},
        )

    def review(self, visit, exception, approved=True):
        self.login_as("account")
        response = self.post(
            f"visitas/{visit.pk}/revisar/",
            {
                "exceptionId": exception.pk,
                "approved": approved,
                "reason": "Reviewed the actual evidence and justification",
            },
        )
        self.login_as("tech")
        return response

    def complete_content_with_exception(self, arrival=False, closure=False, time=False):
        visit = self.visit()
        if arrival:
            self.post(f"visitas/pool/{visit.pk}/tomar/")
            response = self.exception(visit, "arrival")
            self.assertEqual(response.status_code, 200, response.data)
        else:
            self.assertEqual(self.start(visit).status_code, 200)
        if closure:
            self.assertEqual(
                self.historical_exception(
                    visit,
                    {
                        "type": "location",
                        "scope": "closure",
                        "failure": "unavailable",
                        "reason": "Historical closure failure explained",
                    },
                ).status_code,
                200,
            )
        self.assertEqual(self.open(visit).status_code, 200)
        self.draft(visit)
        if time:
            self.expire(visit)
            response = self.historical_exception(
                visit,
                {
                    "type": "time_limit",
                    "reason": "Registration delayed by an actual connection failure",
                },
            )
            self.assertEqual(response.status_code, 200, response.data)
        return visit

    def test_reservations_and_scheduled_tickets_do_not_occupy(self):
        self.contract.frecuencia_visitas_mensual = 2
        self.contract.save()
        for pk in generate_month(self.users["tech"]):
            claimed = self.post(f"visitas/pool/{pk}/tomar/")
            self.assertEqual(claimed.status_code, 200)
            self.assertFalse(claimed.data["occupiesTechnician"])
        ticket_visit = self.visit("ticket")
        self.assertFalse(visit_data(ticket_visit)["occupiesTechnician"])
        recovery = self.client.get("/api/visitas/recuperacion/").data
        self.assertIsNone(recovery["activeExecution"])
        self.assertEqual(len(recovery["reservations"]), 2)

    def test_arrival_occupies_without_starting_form_clock(self):
        visit = self.visit()
        started = self.start(visit)
        self.assertEqual(started.status_code, 200)
        self.assertTrue(started.data["occupiesTechnician"])
        for key in ("physicalEndedAt", "formOpenedAt", "expiresAt", "submittedAt"):
            self.assertIsNone(started.data[key])
        self.assertTrue(started.data["startLocation"]["validated"])
        self.assertEqual(
            self.client.get("/api/visitas/recuperacion/").data["activeExecution"]["id"],
            visit.pk,
        )

    def test_other_work_blocked_through_physical_end_and_expired_incomplete_form(self):
        visit = self.visit()
        other = self.visit("ticket")
        self.start(visit)
        self.assertEqual(self.start(other).status_code, 409)
        self.close(visit)
        self.assertEqual(self.start(other).status_code, 409)
        self.open(visit)
        self.expire(visit)
        self.historical_exception(
            visit,
            {
                "type": "time_limit",
                "reason": "Actual delay during incomplete registration",
            },
        )
        self.assertEqual(self.start(other).status_code, 409)

    def test_different_technician_can_execute_independently(self):
        first = self.visit()
        other = self.visit("ticket")
        other.tecnico = self.users["othertech"]
        other.ticket_origen.tecnico_asignado = self.users["othertech"]
        other.ticket_origen.save()
        other.save()
        self.assertEqual(self.start(first).status_code, 200)
        self.login_as("othertech")
        self.assertEqual(self.start(other).status_code, 200)

    def test_ticket_cannot_arrive_before_scheduled_day(self):
        visit = self.visit("ticket")
        visit.fecha_programada = timezone.now() + timedelta(days=1)
        visit.save()
        self.assertEqual(self.start(visit).status_code, 409)
        self.assertEqual(
            self.post(
                f"visitas/{visit.pk}/excepciones/",
                {
                    "type": "location",
                    "scope": "arrival",
                    "failure": "unavailable",
                    "reason": "GPS could not be obtained",
                },
            ).status_code,
            409,
        )
        visit.refresh_from_db()
        self.assertIsNone(visit.iniciado_en)
        self.assertEqual(visit.excepciones.count(), 0)

    def test_published_obligation_uses_historical_snapshot_after_configuration_changes(
        self,
    ):
        visit = self.visit()
        expected = (
            visit.radio_metros,
            visit.tienda_snapshot.copy(),
            visit.checklist.tareas_snapshot.copy(),
        )
        self.contract.activo = False
        self.contract.radio_validacion_metros = 1
        self.contract.save()
        self.template.activa = False
        self.template.save()
        self.item.descripcion = "Changed after publication"
        self.item.save()
        self.store.latitud = 0
        self.store.save()
        self.assertEqual(
            self.start(visit).status_code, 400
        )  # GPS actual de la tienda editada no es el snapshot.
        original_gps = {**self.gps(), "latitude": expected[1]["latitude"]}
        started = self.post(f"visitas/{visit.pk}/iniciar/", {"location": original_gps})
        self.assertEqual(started.status_code, 200, started.data)
        visit.refresh_from_db()
        self.assertEqual(
            (
                visit.radio_metros,
                visit.tienda_snapshot,
                visit.checklist.tareas_snapshot,
            ),
            expected,
        )

    def test_unavailable_arrival_exception_starts_without_review_or_submission(self):
        visit = self.visit()
        self.post(f"visitas/pool/{visit.pk}/tomar/")
        for failure in ("denied", "timeout", "unavailable"):
            with self.subTest(failure=failure):
                if visit.iniciado_en:
                    self.assertEqual(
                        self.post(
                            f"visitas/{visit.pk}/no-realizada/",
                            {"reason": "Unable to finish this attempt today"},
                        ).status_code,
                        200,
                    )
                    visit = Visita.objects.get(intento_anterior=visit)
                    self.post(f"visitas/pool/{visit.pk}/tomar/")
                response = self.exception(visit, "arrival", failure=failure)
                self.assertEqual(response.status_code, 200, response.data)
                self.assertTrue(response.data["occupiesTechnician"])
                self.assertEqual(response.data["workStatus"], "in_progress")
                self.assertIsNone(response.data["submittedAt"])
                self.assertIsNone(response.data["formOpenedAt"])
                self.assertIsNone(response.data["startLocation"]["latitude"])
                visit.refresh_from_db()

    def test_outside_arrival_exception_preserves_telemetry_and_low_accuracy(self):
        visit = self.visit()
        self.post(f"visitas/pool/{visit.pk}/tomar/")
        raw = {**self.gps(), "latitude": float(self.store.latitud) + 0.02}
        response = self.exception(visit, "arrival", failure="", location=raw)
        self.assertEqual(response.status_code, 200, response.data)
        telemetry = visit.excepciones.get().telemetria
        self.assertEqual(telemetry["latitude"], raw["latitude"])
        self.assertGreater(telemetry["distanceMeters"], telemetry["radiusMeters"])
        self.assertEqual(telemetry["failure"], "out_of_radius")
        closure = {**self.gps(), "accuracy": 101}
        response = self.historical_exception(
            visit,
            {
                "type": "location",
                "scope": "closure",
                "failure": "",
                "location": closure,
                "reason": "Historical low accuracy at closure",
            },
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            visit.excepciones.get(scope="closure").telemetria["accuracy"], 101
        )
        self.assertEqual(visit.excepciones.count(), 2)
        self.assertIsNone(response.data["formOpenedAt"])

    def test_physical_end_is_immutable_and_does_not_open_form(self):
        for origin in ("checklist", "ticket"):
            visit = self.visit(origin)
            self.start(visit)
            closed = self.close(visit)
            self.assertEqual(closed.status_code, 200)
            self.assertIsNotNone(closed.data["physicalEndedAt"])
            self.assertIsNone(closed.data["formOpenedAt"])
            self.assertIsNone(closed.data["expiresAt"])
            repeated = self.post(
                f"visitas/{visit.pk}/ubicacion-cierre/",
                {"location": {**self.gps(), "latitude": 0}},
            )
            self.assertEqual(
                repeated.data["physicalEndedAt"], closed.data["physicalEndedAt"]
            )
            self.assertEqual(repeated.data["endLocation"], closed.data["endLocation"])
            self.assertEqual(visit.eventos.filter(tipo="physical_end").count(), 1)
            self.post(
                f"visitas/{visit.pk}/no-realizada/",
                {"reason": "Physical attempt could not be completed"},
            )

    def test_form_requires_physical_end_and_first_deadline_is_recoverable(self):
        visit = self.visit()
        self.start(visit)
        self.assertEqual(self.post(f"visitas/{visit.pk}/formulario/").status_code, 409)
        self.close(visit)
        first = self.post(f"visitas/{visit.pk}/formulario/")
        second = self.post(f"visitas/{visit.pk}/formulario/")
        self.assertEqual(second.data["formOpenedAt"], first.data["formOpenedAt"])
        self.assertEqual(second.data["expiresAt"], first.data["expiresAt"])
        visit.refresh_from_db()
        self.assertIsNone(visit.formulario_vence_en)
        other_device = APIClient()
        other_device.force_authenticate(self.users["tech"])
        recovery = other_device.get("/api/visitas/recuperacion/").data[
            "activeExecution"
        ]
        self.assertEqual(recovery["expiresAt"], first.data["expiresAt"])
        self.assertEqual(recovery["phase"], "results")

    def test_normal_completion_rejects_new_gps_and_requires_current_content_version(
        self,
    ):
        visit = self.visit()
        self.start(visit)
        self.open(visit)
        self.draft(visit)
        visit.refresh_from_db()
        original = deepcopy(visit.ubicacion_cierre)
        self.assertEqual(
            self.post(
                f"visitas/{visit.pk}/finalizar/",
                {"revision": visit.borrador_revision, "location": self.gps()},
            ).status_code,
            400,
        )
        self.assertEqual(
            self.post(
                f"visitas/{visit.pk}/finalizar/",
                {"revision": visit.borrador_revision - 1},
            ).status_code,
            409,
        )
        with patch(
            "core.services.validate_gps",
            side_effect=AssertionError("El envío no solicita otra lectura"),
        ):
            completed = self.post(
                f"visitas/{visit.pk}/finalizar/", {"revision": visit.borrador_revision}
            )
        self.assertEqual(completed.status_code, 200, completed.data)
        self.assertEqual(completed.data["workStatus"], "finished")
        self.assertEqual(completed.data["endLocation"], original)
        self.assertFalse(completed.data["occupiesTechnician"])
        self.assertEqual(visit.eventos.filter(tipo="review_submission").count(), 0)

    def test_ticket_normal_completion_resolves_related_ticket(self):
        visit = self.visit("ticket")
        self.start(visit)
        self.open(visit)
        self.draft(visit)
        response = self.post(f"visitas/{visit.pk}/finalizar/")
        self.assertEqual(response.status_code, 200, response.data)
        visit.ticket_origen.refresh_from_db()
        self.assertEqual(visit.ticket_origen.estado, "resuelto")
        self.assertEqual(
            visit.ticket_origen.resuelto_en.isoformat(), response.data["completedAt"]
        )

    def test_historical_expiry_keeps_content_and_photos_without_requiring_time_exception(
        self,
    ):
        visit = self.visit()
        self.start(visit)
        self.open(visit)
        file_id, _ = self.draft(visit)
        deadline = self.expire(visit)
        completed = self.post(f"visitas/{visit.pk}/finalizar/")
        self.assertEqual(completed.status_code, 200, completed.data)
        self.assertEqual(completed.data["expiresAt"], deadline.isoformat())
        self.assertIn(file_id, completed.data["answers"][0]["evidenceIds"])
        self.assertGreater(completed.data["registrationSeconds"], 300)
        self.assertFalse(visit.excepciones.exists())

    def test_incomplete_content_cannot_enter_review_and_nf_cannot_decide_early(self):
        visit = self.visit()
        self.start(visit)
        self.historical_exception(
            visit,
            {
                "type": "location",
                "scope": "closure",
                "failure": "unavailable",
                "reason": "Historical closure failure explained",
            },
        )
        self.open(visit)
        self.assertEqual(self.submit(visit).status_code, 400)
        self.assertEqual(
            self.review(visit, visit.excepciones.get(), approved=False).status_code, 409
        )
        visit.refresh_from_db()
        self.assertIsNone(visit.enviado_en)
        self.assertEqual(visit.estado, "en_curso")
        self.assertEqual(visit.excepciones.get().decision, "pending")

    def test_submission_frees_technician_and_in_review_is_read_only(self):
        visit = self.complete_content_with_exception(closure=True)
        submitted = self.submit(visit)
        self.assertEqual(submitted.status_code, 200, submitted.data)
        self.assertTrue(submitted.data["readOnly"])
        self.assertEqual(
            self.post(
                f"visitas/{visit.pk}/borrador/",
                {
                    "revision": submitted.data["revision"],
                    "answers": [],
                    "workDescription": "Changed",
                    "evidenceIds": [],
                },
            ).status_code,
            409,
        )
        self.assertEqual(
            self.exception(
                visit,
                "closure",
                revision=0,
                reason="Different reason before NF decision",
            ).status_code,
            409,
        )
        other = self.visit("ticket")
        self.assertEqual(self.start(other).status_code, 200)

    def test_all_approved_finalize_and_one_rejected_requires_correction(self):
        visit = self.complete_content_with_exception(arrival=True, closure=True)
        self.submit(visit)
        arrival, closure = visit.excepciones.order_by("pk")
        approved = self.review(visit, arrival)
        self.assertEqual(approved.data["workStatus"], "in_review")
        rejected = self.review(visit, closure, approved=False)
        self.assertEqual(rejected.data["workStatus"], "correction_required")
        self.assertFalse(rejected.data["readOnly"])
        self.assertFalse(rejected.data["occupiesTechnician"])
        self.assertEqual(self.submit(visit).status_code, 400)
        correction = self.exception(
            visit,
            "closure",
            revision=0,
            reason="Clarified the actual GPS failure at closure",
        )
        self.assertEqual(correction.status_code, 200, correction.data)
        self.submit(visit)
        accepted = self.review(visit, closure)
        self.assertEqual(accepted.data["workStatus"], "finished")
        self.assertTrue(all(e["approved"] for e in accepted.data["exceptions"]))
        for key in ("startedAt", "physicalEndedAt", "formOpenedAt", "expiresAt"):
            self.assertEqual(accepted.data[key], rejected.data[key])

    def test_each_corrected_exception_reopens_only_its_own_version_and_decision(self):
        visit = self.complete_content_with_exception(
            arrival=True, closure=True, time=True
        )
        self.submit(visit)
        arrival = visit.excepciones.get(scope="arrival")
        closure = visit.excepciones.get(scope="closure")
        timed = visit.excepciones.get(tipo="time_limit")
        self.review(visit, arrival)
        self.review(visit, closure)
        self.review(visit, timed, approved=False)
        visit.refresh_from_db()
        edited = self.post(
            f"visitas/{visit.pk}/borrador/",
            {
                "revision": visit.borrador_revision,
                "answers": [],
                "workDescription": "Corrected technical description",
                "evidenceIds": [],
            },
        )
        self.assertEqual(edited.status_code, 200, edited.data)
        for exception in (arrival, closure):
            exception.refresh_from_db()
            self.assertEqual((exception.decision, exception.revision), ("approved", 0))
        self.assertEqual(
            self.exception(
                visit,
                "arrival",
                revision=0,
                reason="Corrected arrival justification with real details",
            ).status_code,
            200,
        )
        closure.refresh_from_db()
        self.assertEqual(closure.decision, "approved")
        self.assertEqual(
            self.post(
                f"visitas/{visit.pk}/excepciones/",
                {
                    "type": "time_limit",
                    "revision": 0,
                    "reason": "Corrected explanation of the real registration delay",
                },
            ).status_code,
            200,
        )
        arrival.refresh_from_db()
        timed.refresh_from_db()
        self.assertEqual(
            (arrival.decision, arrival.revision, timed.decision, timed.revision),
            ("pending", 1, "pending", 1),
        )
        previous = list(
            visit.eventos.filter(tipo="exception_previous").values_list(
                "datos", flat=True
            )
        )
        self.assertEqual(
            {row["exception"]["approved"] for row in previous}, {True, False}
        )
        self.assertEqual(
            self.exception(
                visit,
                "closure",
                revision=0,
                reason="Corrected only the closure GPS justification",
            ).status_code,
            200,
        )
        arrival.refresh_from_db()
        self.assertEqual(arrival.revision, 1)
        closure.refresh_from_db()
        self.assertEqual((closure.decision, closure.revision), ("pending", 1))
        visit.refresh_from_db()
        physical = (
            visit.iniciado_en,
            visit.terminado_en,
            visit.ubicacion_inicio,
            visit.ubicacion_cierre,
        )
        real_reading = {**self.gps(), "accuracy": 101}
        corrected_data = self.exception(
            visit,
            "arrival",
            revision=1,
            failure="",
            location=real_reading,
            reason="Corrected arrival GPS data with the actual available reading",
        )
        self.assertEqual(corrected_data.status_code, 400, corrected_data.data)
        arrival.refresh_from_db()
        closure.refresh_from_db()
        timed.refresh_from_db()
        self.assertEqual(
            (arrival.revision, closure.revision, timed.revision), (1, 1, 1)
        )
        self.assertIsNone(arrival.telemetria["accuracy"])
        visit.refresh_from_db()
        self.assertEqual(
            (
                visit.iniciado_en,
                visit.terminado_en,
                visit.ubicacion_inicio,
                visit.ubicacion_cierre,
            ),
            physical,
        )

    def test_no_aplica_requires_reason_but_never_photo(self):
        visit = self.visit()
        self.start(visit)
        self.open(visit)
        body = {
            "revision": 0,
            "answers": [
                {
                    "taskId": self.item.pk,
                    "result": "no_aplica",
                    "observation": "",
                    "evidenceIds": [],
                }
            ],
            "workDescription": "",
            "evidenceIds": [],
        }
        self.assertEqual(
            self.post(f"visitas/{visit.pk}/borrador/", body).status_code, 200
        )
        self.assertEqual(self.post(f"visitas/{visit.pk}/finalizar/").status_code, 400)
        body["revision"] = 1
        body["answers"][0][
            "observation"
        ] = "This component is not installed at the store"
        self.assertEqual(
            self.post(f"visitas/{visit.pk}/borrador/", body).status_code, 200
        )
        self.assertEqual(self.post(f"visitas/{visit.pk}/finalizar/").status_code, 200)

    def test_conforme_and_no_conforme_photo_and_observation_rules(self):
        visit = self.visit()
        self.start(visit)
        self.open(visit)
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
        self.post(f"visitas/{visit.pk}/borrador/", body)
        self.assertEqual(self.post(f"visitas/{visit.pk}/finalizar/").status_code, 400)
        visit.checklist.tareas_snapshot[0][
            "photoRequired"
        ] = False  # Fixture publicado explícito de la variante sin foto.
        visit.checklist.save()
        from .services import validate_content

        validate_content(visit)
        body.update(revision=1)
        body["answers"][0]["result"] = "no_conforme"
        self.post(f"visitas/{visit.pk}/borrador/", body)
        self.assertEqual(self.post(f"visitas/{visit.pk}/finalizar/").status_code, 400)
        body.update(revision=2)
        body["answers"][0][
            "observation"
        ] = "Actual non-conformity found during inspection"
        self.post(f"visitas/{visit.pk}/borrador/", body)
        self.assertEqual(self.post(f"visitas/{visit.pk}/finalizar/").status_code, 200)

    def test_scheduling_identical_is_neutral_and_real_changes_require_reason(self):
        ticket = Ticket.objects.create(
            tienda=self.store,
            categoria=self.category,
            urgencia=self.urgency,
            reportado_por=self.users["store"],
            descripcion="Actual issue requiring attention",
        )
        self.login_as("account")
        data = {
            "technicianId": self.users["tech"].pk,
            "scheduledAt": (timezone.now() + timedelta(hours=1)).isoformat(),
            "priorityId": self.urgency.pk,
            "revision": 0,
        }
        first = self.post(f"tickets/{ticket.pk}/programar/", data)
        self.assertEqual(first.status_code, 200, first.data)
        events = Evento.objects.filter(ticket=ticket).count()
        repeated = self.post(f"tickets/{ticket.pk}/programar/", {**data, "revision": 1})
        self.assertEqual(repeated.status_code, 200, repeated.data)
        self.assertEqual(repeated.data["visitId"], first.data["visitId"])
        self.assertEqual(repeated.data["revision"], 1)
        self.assertEqual(Evento.objects.filter(ticket=ticket).count(), events)
        self.assertEqual(ticket.visitas_generadas.count(), 1)
        changed = {**data, "revision": 1, "technicianId": self.users["othertech"].pk}
        self.assertEqual(
            self.post(f"tickets/{ticket.pk}/programar/", changed).status_code, 400
        )
        changed["reason"] = "Technician availability changed before arrival"
        self.assertEqual(
            self.post(f"tickets/{ticket.pk}/programar/", changed).status_code, 200
        )

    def test_scheduling_after_arrival_is_rejected_even_if_values_unchanged(self):
        visit = self.visit("ticket")
        Ticket.objects.filter(pk=visit.ticket_origen_id).update(
            fecha_programada=visit.fecha_programada
        )
        self.start(visit)
        self.login_as("account")
        data = {
            "technicianId": self.users["tech"].pk,
            "scheduledAt": visit.fecha_programada.isoformat(),
            "priorityId": self.urgency.pk,
            "revision": 0,
        }
        self.assertEqual(
            self.post(f"tickets/{visit.ticket_origen_id}/programar/", data).status_code,
            409,
        )

    def test_removed_coverage_continues_through_rejection_and_finishes_then_denies(
        self,
    ):
        visit = self.visit()
        self.start(visit)
        CoberturaUsuario.objects.filter(usuario=self.users["tech"]).update(activo=False)
        self.assertEqual(
            self.historical_exception(
                visit,
                {
                    "type": "location",
                    "scope": "closure",
                    "failure": "unavailable",
                    "reason": "Historical closure failure explained",
                },
            ).status_code,
            200,
        )
        self.assertEqual(self.open(visit).status_code, 200)
        self.draft(visit)
        self.assertEqual(self.submit(visit).status_code, 200)
        exception = visit.excepciones.get()
        rejected = self.review(visit, exception, approved=False)
        self.assertEqual(rejected.data["workStatus"], "correction_required")
        self.assertEqual(self.client.get(f"/api/visitas/{visit.pk}/").status_code, 200)
        self.assertEqual(
            self.exception(
                visit,
                "closure",
                revision=0,
                reason="Clarified the actual closure GPS problem",
            ).status_code,
            200,
        )
        self.assertEqual(self.submit(visit).status_code, 200)
        self.assertEqual(self.review(visit, exception).data["workStatus"], "finished")
        self.assertEqual(self.client.get(f"/api/visitas/{visit.pk}/").status_code, 404)
        self.assertEqual(
            self.client.get(f"/api/tiendas/{self.store.pk}/").status_code, 404
        )

    def test_pending_reviews_requires_complete_submitted_pending_and_nf_scope(self):
        visit = self.complete_content_with_exception(closure=True)
        self.login_as("account")
        self.assertEqual(self.client.get("/api/revisiones/pendientes/").data, [])
        self.login_as("tech")
        submitted = self.submit(visit)
        self.login_as("account")
        queue = self.client.get("/api/revisiones/pendientes/").data
        self.assertEqual([row["id"] for row in queue], [visit.pk])
        self.assertEqual(queue[0]["submittedAt"], submitted.data["submittedAt"])
        self.login_as("outsider")
        self.assertEqual(self.client.get("/api/revisiones/pendientes/").data, [])
        for actor in ("tech", "store"):
            self.login_as(actor)
            self.assertEqual(
                self.client.get("/api/revisiones/pendientes/").status_code, 403
            )
        self.review(visit, visit.excepciones.get())
        self.login_as("account")
        self.assertEqual(self.client.get("/api/revisiones/pendientes/").data, [])

    def test_legacy_open_form_cannot_fabricate_physical_end_or_exception_scope(self):
        visit = self.visit()
        self.start(visit)
        opened = timezone.now()
        Visita.objects.filter(pk=visit.pk).update(
            formulario_abierto_en=opened,
            formulario_vence_en=opened + timedelta(minutes=5),
        )
        self.assertEqual(self.close(visit).status_code, 409)
        self.assertEqual(self.exception(visit, "closure").status_code, 400)
        self.assertEqual(
            self.post(
                f"visitas/{visit.pk}/excepciones/",
                {
                    "type": "location",
                    "failure": "denied",
                    "reason": "Historical GPS origin was never recorded",
                },
            ).status_code,
            400,
        )
        visit.refresh_from_db()
        self.assertIsNone(visit.terminado_en)
        self.assertIsNone(visit.ubicacion_cierre)
        self.assertIsNone(visit.enviado_en)
        self.assertEqual(visit.formulario_abierto_en, opened)
        self.assertFalse(visit.excepciones.exists())
        incomplete = Visita.objects.create(
            tienda=self.store,
            tecnico=self.users["tech"],
            origen="checklist",
            fecha_programada=timezone.now(),
            periodo=visit.periodo,
            cuota=2,
            radio_metros=visit.radio_metros,
            tienda_snapshot=visit.tienda_snapshot,
            reclamada_en=opened,
            reclamo_vence_en=opened + timedelta(hours=2),
        )
        self.assertEqual(
            self.post(
                f"visitas/{incomplete.pk}/iniciar/", {"location": self.gps()}
            ).status_code,
            409,
        )
        self.assertFalse(incomplete.eventos.exists())

    def test_nf_rejects_stale_versions_and_outside_coverage(self):
        visit = self.complete_content_with_exception(closure=True)
        submitted = self.submit(visit)
        exception = visit.excepciones.get()
        self.login_as("account")
        body = {
            "exceptionId": exception.pk,
            "approved": True,
            "reason": "Reviewed the actual closure evidence",
            "revision": submitted.data["revision"] - 1,
            "exceptionRevision": exception.revision,
        }
        self.assertEqual(
            self.post(f"visitas/{visit.pk}/revisar/", body).status_code, 409
        )
        body.update(
            revision=submitted.data["revision"],
            exceptionRevision=exception.revision + 1,
        )
        self.assertEqual(
            self.post(f"visitas/{visit.pk}/revisar/", body).status_code, 409
        )
        self.login_as("outsider")
        body["exceptionRevision"] = exception.revision
        self.assertEqual(
            self.post(f"visitas/{visit.pk}/revisar/", body).status_code, 404
        )
        exception.refresh_from_db()
        self.assertEqual(exception.decision, "pending")

    def test_nf_export_keeps_both_gps_stages_and_physical_finish(self):
        visit = self.complete_content_with_exception(arrival=True, closure=True)
        self.submit(visit)
        self.login_as("account")
        response = self.client.get("/api/reportes/exportar/")
        self.assertEqual(response.status_code, 200)
        import csv
        from io import StringIO

        row = next(csv.DictReader(StringIO(response.content.decode("utf-8-sig"))))
        visit.refresh_from_db()
        self.assertEqual(row["fin_fisico"], visit.terminado_en.isoformat())
        self.assertEqual(row["excepcion_gps"], "arrival:pending; closure:pending")

    def test_store_supervisor_does_not_receive_internal_nested_audit(self):
        visit = self.visit("ticket")
        self.start(visit)
        self.historical_exception(
            visit,
            {
                "type": "location",
                "scope": "closure",
                "reason": "Internal GPS failure explanation visible only to NF",
            },
        )
        self.open(visit)
        self.draft(visit)
        self.submit(visit)
        self.login_as("store")
        dto = self.client.get(f"/api/visitas/{visit.pk}/").data
        for key in (
            "exceptions",
            "exception",
            "exceptionHistory",
            "startLocation",
            "endLocation",
            "radiusMeters",
            "timeExceptionReason",
            "claimHistory",
        ):
            self.assertNotIn(key, dto)
        ticket = self.client.get(f"/api/tickets/{visit.ticket_origen_id}/").data
        self.assertNotIn("Internal GPS", str(ticket))
        self.assertTrue(all("data" not in row for row in ticket["history"]))
        self.login_as("account")
        internal = self.client.get(f"/api/tickets/{visit.ticket_origen_id}/").data
        self.assertIn("Internal GPS", str(internal))

    def test_not_performed_preserves_attempt_and_republishes_same_checklist_quota(self):
        visit = self.visit()
        self.start(visit)
        original = (visit.tienda_snapshot, visit.checklist.tareas_snapshot)
        result = self.post(
            f"visitas/{visit.pk}/no-realizada/",
            {"reason": "Access to the required equipment was unavailable"},
        )
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data["workStatus"], "cancelled")
        self.assertFalse(result.data["occupiesTechnician"])
        self.assertIsNone(result.data["submittedAt"])
        self.assertIsNone(result.data["completedAt"])
        retry = Visita.objects.get(intento_anterior=visit)
        self.assertEqual((retry.cuota, retry.periodo), (visit.cuota, visit.periodo))
        self.assertEqual(
            (retry.tienda_snapshot, retry.checklist.tareas_snapshot), original
        )
        self.assertIsNone(retry.iniciado_en)
        self.assertIsNone(retry.tecnico_id)
        self.assertEqual(generate_month(self.users["tech"]), [retry.pk])
        self.assertEqual(visit_data(retry)["quotaCount"], 1)
        self.assertEqual(self.start(retry).status_code, 200)
        self.login_as("account")
        self.assertEqual(self.client.get("/api/dashboard/").data["pendingVisits"], 1)

    def test_not_performed_ticket_returns_pending_and_preserves_started_technician(
        self,
    ):
        visit = self.visit("ticket")
        self.start(visit)
        result = self.post(
            f"visitas/{visit.pk}/no-realizada/",
            {"reason": "Store access was interrupted during the actual attempt"},
        )
        self.assertEqual(result.status_code, 200, result.data)
        visit.refresh_from_db()
        ticket = visit.ticket_origen
        self.assertEqual(visit.tecnico_id, self.users["tech"].pk)
        self.assertFalse(visit.vigente)
        self.assertEqual(ticket.estado, "abierto")
        self.assertIsNone(ticket.resuelto_en)
        self.login_as("account")
        body = {
            "technicianId": self.users["othertech"].pk,
            "scheduledAt": (timezone.now() + timedelta(hours=1)).isoformat(),
            "priorityId": self.urgency.pk,
            "revision": ticket.revision,
            "reason": "New attention scheduled after the audited failed attempt",
        }
        response = self.post(f"tickets/{ticket.pk}/programar/", body)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotEqual(response.data["visitId"], visit.pk)

    def test_only_nf_cancels_scheduled_attention_before_arrival(self):
        visit = self.visit("ticket")
        self.assertEqual(
            self.post(
                f"visitas/{visit.pk}/no-realizada/",
                {"reason": "Cancellation before arrival needs NF"},
            ).status_code,
            409,
        )
        self.login_as("account")
        self.assertEqual(
            self.post(
                f"visitas/{visit.pk}/no-realizada/",
                {"reason": "Store requested a different attention schedule"},
            ).status_code,
            200,
        )
        visit.ticket_origen.refresh_from_db()
        self.assertEqual(visit.ticket_origen.estado, "abierto")

    def test_content_evidence_changes_participate_in_cas_without_reopening_gps(self):
        visit = self.visit()
        self.start(visit)
        self.open(visit)
        original = visit.borrador_revision
        uploaded = self.upload(visit)
        self.assertEqual(uploaded.status_code, 201)
        visit.refresh_from_db()
        self.assertEqual(visit.borrador_revision, original + 1)
        self.assertEqual(self.upload(visit, uploaded.data["id"]).status_code, 200)
        visit.refresh_from_db()
        self.assertEqual(visit.borrador_revision, original + 1)
        self.assertEqual(
            self.client.delete(f"/api/evidencias/{uploaded.data['id']}/").status_code,
            204,
        )
        visit.refresh_from_db()
        self.assertEqual(visit.borrador_revision, original + 2)


class OperationalConcurrencyTests(TransactionTestCase):
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

    def test_two_simultaneous_arrivals_same_technician_exactly_one_wins(self):
        self.assertEqual(connection.vendor, "postgresql")
        self.contract.frecuencia_visitas_mensual = 2
        self.contract.save()
        ids = generate_month(self.users["tech"])
        claimed = timezone.now()
        Visita.objects.filter(pk__in=ids).update(
            tecnico=self.users["tech"],
            reclamada_en=claimed,
            reclamo_vence_en=claimed + timedelta(hours=2),
        )
        barrier = Barrier(2)

        def start(pk):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(self.users["tech"])
                raw = {
                    "latitude": float(self.store.latitud),
                    "longitude": float(self.store.longitud),
                    "accuracy": 8,
                    "capturedAt": timezone.now().timestamp() * 1000,
                }
                barrier.wait(timeout=10)
                return client.post(
                    f"/api/visitas/{pk}/iniciar/",
                    {"location": raw},
                    format="json",
                    HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
                ).status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(start, ids))
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(
            Visita.objects.filter(
                tecnico=self.users["tech"],
                iniciado_en__isnull=False,
                enviado_en__isnull=True,
            ).count(),
            1,
        )

    def test_postgresql_constraint_also_blocks_direct_second_active_write(self):
        self.contract.frecuencia_visitas_mensual = 2
        self.contract.save()
        ids = generate_month(self.users["tech"])
        Visita.objects.filter(pk=ids[0]).update(
            tecnico=self.users["tech"], iniciado_en=timezone.now(), estado="en_curso"
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            Visita.objects.filter(pk=ids[1]).update(
                tecnico=self.users["tech"],
                iniciado_en=timezone.now(),
                estado="en_curso",
            )


class OperationalMigrationTests(TransactionTestCase):
    before = [("core", "0017_zona_cobertura_usuario_cliente_especialidad")]
    after = [("core", "0018_operational_v2")]

    def setUp(self):
        self.addCleanup(self.restore_schema)
        executor = MigrationExecutor(connection)
        executor.migrate(self.before)
        self.old = executor.loader.project_state(self.before).apps

    def restore_schema(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())

    def historical_visit(self):
        role = self.old.get_model("core", "Rol").objects.create(nombre="Tecnico")
        user = self.old.get_model("core", "Usuario").objects.create(
            username="migration-v2", rol=role
        )
        client = self.old.get_model("core", "Cliente").objects.create(
            razon_social="Historical client", ruc="OPERATIONAL-V2"
        )
        store = self.old.get_model("core", "Tienda").objects.create(
            cliente=client,
            nombre="Historical store",
            direccion="Actual historical address",
            latitud="-12.1",
            longitud="-77.1",
        )
        return self.old.get_model("core", "Visita").objects.create(
            tienda=store,
            tecnico=user,
            fecha_programada=timezone.now(),
            iniciado_en=timezone.now(),
            estado="en_curso",
        )

    def test_upgrade_preserves_history_and_marks_unknown_exception_scope(self):
        visit = self.historical_visit()
        opened = timezone.now()
        self.old.get_model("core", "Visita").objects.filter(pk=visit.pk).update(
            latitud_inicio="-12.100000",
            longitud_inicio="-77.100000",
            distancia_inicio_metros="18.00",
            latitud_cierre="-12.100100",
            longitud_cierre="-77.100100",
            distancia_medida_metros="32.00",
            formulario_abierto_en=opened,
            formulario_vence_en=opened + timedelta(minutes=5),
            enviado_en=opened + timedelta(seconds=1),
            estado="pendiente_validacion",
        )
        exception = self.old.get_model("core", "Excepcion").objects.create(
            visita=visit,
            tipo="location",
            autor_id=visit.tecnico_id,
            motivo="Original historical GPS reason",
            fallo="denied",
        )
        before_visit = (
            self.old.get_model("core", "Visita").objects.values().get(pk=visit.pk)
        )
        before_exception = (
            self.old.get_model("core", "Excepcion")
            .objects.values()
            .get(pk=exception.pk)
        )
        executor = MigrationExecutor(connection)
        executor.migrate(self.after)
        current = executor.loader.project_state(self.after).apps
        migrated = current.get_model("core", "Visita").objects.values().get(pk=visit.pk)
        changed = (
            current.get_model("core", "Excepcion").objects.values().get(pk=exception.pk)
        )
        for field, value in before_visit.items():
            self.assertEqual(migrated[field], value)
        for field, value in before_exception.items():
            self.assertEqual(changed[field], value)
        self.assertIsNone(migrated["terminado_en"])
        self.assertIsNone(migrated["no_realizada_en"])
        self.assertIsNone(migrated["intento_anterior_id"])
        self.assertEqual(changed["scope"], "legacy")
        self.assertIsNone(changed["telemetria"])

    def test_migration_refuses_duplicate_active_legacy_without_choosing_winner(self):
        visit = self.historical_visit()
        duplicate = self.old.get_model("core", "Visita").objects.create(
            tienda_id=visit.tienda_id,
            tecnico_id=visit.tecnico_id,
            fecha_programada=timezone.now(),
            iniciado_en=timezone.now(),
            estado="en_curso",
        )
        try:
            executor = MigrationExecutor(connection)
            with self.assertRaisesRegex(RuntimeError, "revisión auditada"):
                executor.migrate(self.after)
            self.assertEqual(
                self.old.get_model("core", "Visita")
                .objects.filter(estado="en_curso")
                .count(),
                2,
            )
        finally:
            # Solo limpia el dato incompatible de este test para restaurar su esquema.
            self.old.get_model("core", "Visita").objects.filter(
                pk=duplicate.pk
            ).delete()
