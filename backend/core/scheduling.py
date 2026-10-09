"""Ticket scheduling uses calendar days in Peru, retaining legacy timestamps."""

from datetime import datetime, time
from zoneinfo import ZoneInfo

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import serializers

LIMA = ZoneInfo("America/Lima")


def scheduled_day(value):
    return value.astimezone(LIMA).date()


class ScheduleDayField(serializers.Field):
    """Accept ISO days and offset-aware legacy requests; store Lima midnight.

    Existing rows are never normalized. Offset-free datetimes are ambiguous and
    rejected rather than interpreted in the server or device timezone.
    """

    def to_internal_value(self, value):
        try:
            day = (
                parse_date(value)
                if isinstance(value, str) and len(value) == 10
                else None
            )
            if day is None:
                instant = parse_datetime(value) if isinstance(value, str) else None
                if instant is None or timezone.is_naive(instant):
                    raise ValueError
                day = scheduled_day(instant)
            return datetime.combine(day, time.min, tzinfo=LIMA)
        except (TypeError, ValueError, OverflowError):
            raise serializers.ValidationError(
                "Selecciona una fecha válida para la atención."
            )

    def to_representation(self, value):
        return scheduled_day(value).isoformat()
