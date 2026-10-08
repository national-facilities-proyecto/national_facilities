"""Datos de presentación móvil: identidades, consultas y auditoría intacta."""

from datetime import timedelta
from django.test import TestCase
from django.utils import timezone

from .models import Evento, Excepcion
from .serializers import prepare_visit_audit, visit_data
from . import tests as integration


class MobilePresentationTests(TestCase):
    setUp = integration.IntegrationTests.setUp
    login_as = integration.IntegrationTests.login_as
    visit = integration.IntegrationTests.visit

    def audit_visit(self, origin="checklist"):
        visit = self.visit(origin)
        snapshot = {
            "type": "location",
            "scope": "legacy",
            "reason": "Justificación histórica",
            "failure": "denied",
            "authorId": self.users["tech"].pk,
            "reviewerId": self.users["othertech"].pk,
            "approved": False,
            "reviewReason": "Decisión histórica conservada",
        }
        Excepcion.objects.create(
            visita=visit,
            tipo="location",
            scope="legacy",
            autor=self.users["tech"],
            motivo="Motivo corregido",
            revisor=self.users["account"],
            decision="approved",
        )
        event = Evento.objects.create(
            visita=visit,
            actor=self.users["othertech"],
            tipo="review",
            texto="Decisión",
            datos={"exception": snapshot},
        )
        return visit, event, snapshot

    def test_distinct_author_reviewer_and_historical_actor_without_rewriting(self):
        for key, first, last in [
            ("tech", "Ana", "Técnica"),
            ("account", "Luis", "Supervisor"),
            ("othertech", "Rosa", "Revisora"),
        ]:
            user = self.users[key]
            user.first_name, user.last_name = first, last
            user.save(update_fields=["first_name", "last_name"])
        visit, event, snapshot = self.audit_visit()
        data = visit_data(visit, user=self.users["tech"])
        self.assertEqual(data["exceptions"][0]["authorName"], "Ana Técnica")
        self.assertEqual(data["exceptions"][0]["reviewerName"], "Luis Supervisor")
        history = data["exceptionHistory"][0]
        self.assertEqual(history["actorName"], "Rosa Revisora")
        self.assertEqual(history["exception"]["reviewerName"], "Rosa Revisora")
        self.assertFalse(history["exception"]["approved"])
        self.assertEqual(history["exception"]["authorId"], self.users["tech"].pk)
        event.refresh_from_db()
        self.assertEqual(event.datos["exception"], snapshot)
        public = visit_data(visit, user=self.users["store"])
        self.assertNotIn("exceptionHistory", public)
        self.assertNotIn("exceptions", public)
        self.assertNotIn("technicianName", public)

    def test_identity_query_count_is_constant_for_visits_and_events(self):
        first, _, _ = self.audit_visit()
        with self.assertNumQueries(4):
            prepare_visit_audit([first])
        second, _, snapshot = self.audit_visit("ticket")
        for _ in range(20):
            Evento.objects.create(
                visita=second,
                actor=self.users["tech"],
                tipo="exception_previous",
                texto="Versión anterior",
                datos={"exception": snapshot},
            )
        with self.assertNumQueries(4):
            prepare_visit_audit([first, second])
        self.assertIsNone(first._audit_names[self.users["tech"].pk])
        self.assertEqual(len(second._audit_events), 21)

    def test_durations_keep_backend_precision_and_anomalous_history(self):
        visit = self.visit()
        now = timezone.now()
        visit.iniciado_en = now
        visit.terminado_en = now + timedelta(seconds=966.588154)
        visit.formulario_abierto_en = now + timedelta(seconds=1037.796682)
        visit.enviado_en = now + timedelta(seconds=43064.997793)
        data = visit_data(visit)
        self.assertAlmostEqual(data["totalSeconds"], 43064.997793)
        self.assertAlmostEqual(data["executionSeconds"], 966.588154)
        self.assertAlmostEqual(data["registrationSeconds"], 42027.201111)
        visit.terminado_en = now - timedelta(seconds=1)
        visit.formulario_abierto_en = None
        anomalous = visit_data(visit)
        self.assertEqual(anomalous["executionSeconds"], -1)
        self.assertIsNone(anomalous["registrationSeconds"])
