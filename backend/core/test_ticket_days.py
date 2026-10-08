"""Calendar-day ticket scheduling with real permissions, GPS and legacy rows."""

from datetime import datetime, time, timedelta
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from . import tests as integration
from .models import Evento, Ticket, Visita
from .scheduling import LIMA, ScheduleDayField, scheduled_day
from .serializers import ticket_data
from .services import Conflict, ensure_startable


class TicketDayTests(TestCase):
    setUp = integration.IntegrationTests.setUp
    login_as = integration.IntegrationTests.login_as
    post = integration.IntegrationTests.post
    visit = integration.IntegrationTests.visit
    gps = integration.IntegrationTests.gps

    def new_ticket(self):
        return Ticket.objects.create(
            tienda=self.store,
            categoria=self.category,
            urgencia=self.urgency,
            reportado_por=self.users["store"],
            descripcion="Incidencia real de prueba aislada",
        )

    def schedule(self, ticket, day, **extra):
        return self.post(
            f"tickets/{ticket.pk}/programar/",
            {
                "technicianId": self.users["tech"].pk,
                "priorityId": self.urgency.pk,
                "scheduledAt": day,
                "revision": ticket.revision,
                **extra,
            },
        )

    def test_today_at_late_hour_can_schedule_lima_midnight_even_with_other_timezone(
        self,
    ):
        self.login_as("account")
        ticket = self.new_ticket()
        day = scheduled_day(timezone.now())
        late = datetime.combine(day, time(23, 59), tzinfo=LIMA)
        with timezone.override("Asia/Tokyo"), patch(
            "core.ticket_views.timezone.now", return_value=late
        ):
            response = self.schedule(ticket, day.isoformat())
        self.assertEqual(response.status_code, 200, response.data)
        visit = Visita.objects.get(pk=response.data["visitId"])
        self.assertEqual(
            visit.fecha_programada, datetime.combine(day, time.min, tzinfo=LIMA)
        )
        self.assertEqual(
            datetime.fromisoformat(response.data["scheduledAt"]), visit.fecha_programada
        )

    def test_same_day_any_hour_and_late_start_do_not_rewrite_legacy_date(self):
        visit = self.visit("ticket")
        day = scheduled_day(timezone.now())
        historical = datetime.combine(day, time(22, 30), tzinfo=LIMA)
        visit.fecha_programada = historical
        visit.save()
        for hour in (0, 8, 23):
            with self.subTest(hour=hour), timezone.override("Pacific/Kiritimati"):
                ensure_startable(
                    self.users["tech"],
                    visit,
                    at=datetime.combine(day, time(hour), tzinfo=LIMA),
                )
        ensure_startable(self.users["tech"], visit, at=historical + timedelta(days=2))
        with self.assertRaises(Conflict) as caught:
            ensure_startable(
                self.users["tech"], visit, at=historical - timedelta(days=1)
            )
        self.assertNotIn("scheduledAt", str(caught.exception))
        early = datetime.combine(day, time(1), tzinfo=LIMA)
        self.login_as("tech")
        with patch("core.services.timezone.now", return_value=early):
            response = self.post(
                f"visitas/{visit.pk}/iniciar/", {"location": self.gps()}
            )
        self.assertEqual(response.status_code, 200, response.data)
        visit.refresh_from_db()
        self.assertEqual(visit.fecha_programada, historical)
        self.assertEqual(visit.iniciado_en, early)
        self.assertEqual(visit.eventos.filter(tipo="start").count(), 1)

    def test_offset_requests_are_explicit_and_invalid_or_ambiguous_dates_rejected(self):
        field = ScheduleDayField()
        self.assertEqual(
            field.run_validation("2026-10-09T02:00:00+00:00"),
            datetime(2026, 10, 8, tzinfo=LIMA),
        )
        for value in ("2026-10-08T12:00:00", "08/10/2026", "2026-02-30", None):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                field.run_validation(value)
        self.login_as("account")
        response = self.schedule(
            self.new_ticket(),
            (scheduled_day(timezone.now()) - timedelta(days=1)).isoformat(),
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("hoy", str(response.data["scheduledAt"]))

    def test_same_day_noop_preserves_legacy_timestamp_events_and_reprogram_requires_reason(
        self,
    ):
        visit = self.visit("ticket")
        ticket = visit.ticket_origen
        original = visit.fecha_programada
        ticket.fecha_programada = original
        ticket.save()
        self.login_as("account")
        count = Evento.objects.count()
        result = self.schedule(ticket, scheduled_day(original).isoformat())
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data["visitId"], visit.pk)
        ticket.refresh_from_db()
        self.assertEqual(ticket.fecha_programada, original)
        self.assertEqual(Evento.objects.count(), count)
        next_day = (scheduled_day(original) + timedelta(days=1)).isoformat()
        self.assertEqual(self.schedule(ticket, next_day).status_code, 400)
        result = self.schedule(
            ticket, next_day, reason="Cambio de disponibilidad del técnico"
        )
        self.assertEqual(result.status_code, 200, result.data)
        visit.refresh_from_db()
        self.assertEqual(visit.fecha_programada, original)
        self.assertFalse(visit.vigente)
        self.assertEqual(ticket.eventos.filter(tipo="invalidate").count(), 1)
        self.assertEqual(ticket.eventos.filter(tipo="schedule").count(), 1)
        public = ticket_data(ticket, self.users["store"])
        self.assertEqual(public["history"][0]["text"], "Atención reprogramada")
        self.assertNotIn("data", public["history"][0])
        private = ticket_data(ticket, self.users["account"])
        self.assertEqual(
            {event["kind"] for event in private["history"]}, {"invalidate", "schedule"}
        )
        self.login_as("store")
        self.assertEqual(self.schedule(ticket, next_day).status_code, 403)
