"""Evaluación GPS autoritativa sobre el snapshot publicado, sin fabricar lecturas."""

import math
from django.utils import timezone
from rest_framework.exceptions import ValidationError

MAX_AGE_MS = 60_000
MAX_FUTURE_MS = 5_000
MAX_ACCURACY_METERS = 100
DEVICE_FAILURES = ("denied", "timeout", "unavailable")
MESSAGES = {
    "denied": "Permiso GPS denegado.",
    "timeout": "La lectura GPS agotó su tiempo.",
    "unavailable": "GPS no disponible.",
    "incomplete": "Se requiere una lectura GPS completa.",
    "invalid_coordinates": "Coordenadas o precisión inválidas.",
    "stale": "La lectura GPS caducó. Solicita una nueva.",
    "future": "La lectura GPS tiene un timestamp futuro.",
    "low_accuracy": "Precisión insuficiente para el radio publicado.",
    "out_of_radius": "Fuera del radio permitido.",
}


def evaluate_gps(data, visit, failure=""):
    from .services import Conflict

    radius = visit.radio_metros
    snapshot = visit.tienda_snapshot
    if (
        not radius
        or not isinstance(snapshot, dict)
        or any(snapshot.get(k) is None for k in ("latitude", "longitude"))
    ):
        raise Conflict(
            "La ejecución histórica no tiene radio/GPS publicado; requiere revisión explícita."
        )
    if data is not None and not isinstance(data, dict):
        raise ValidationError({"location": "La lectura GPS debe ser un objeto."})
    values = {}
    for key in ("latitude", "longitude", "accuracy", "capturedAt"):
        value = (data or {}).get(key)
        if value is not None and (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
        ):
            raise ValidationError(
                {"location": f"{key}: debe ser un número finito o no registrado."}
            )
        values[key] = value
    result = {
        **values,
        "distanceMeters": None,
        "radiusMeters": radius,
        "validated": False,
        "failure": "",
    }
    lat, lon = values["latitude"], values["longitude"]
    distance = None
    coordinates_ok = (
        lat is not None and lon is not None and abs(lat) <= 90 and abs(lon) <= 180
    )
    if coordinates_ok:
        rad = math.pi / 180
        a = (
            math.sin((float(snapshot["latitude"]) - lat) * rad / 2) ** 2
            + math.cos(float(snapshot["latitude"]) * rad)
            * math.cos(lat * rad)
            * math.sin((float(snapshot["longitude"]) - lon) * rad / 2) ** 2
        )
        a = min(1, max(0, a))
        distance = 6371000 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        result["distanceMeters"] = round(distance, 2)
    if failure in DEVICE_FAILURES and any(value is None for value in values.values()):
        result["failure"] = failure
    elif any(value is None for value in values.values()):
        result["failure"] = "incomplete"
    elif not coordinates_ok or values["accuracy"] < 0:
        result["failure"] = "invalid_coordinates"
    else:
        now_ms = timezone.now().timestamp() * 1000
        if now_ms - values["capturedAt"] > MAX_AGE_MS:
            result["failure"] = "stale"
        elif values["capturedAt"] > now_ms + MAX_FUTURE_MS:
            result["failure"] = "future"
        elif values["accuracy"] > min(radius, MAX_ACCURACY_METERS):
            result["failure"] = "low_accuracy"
        elif distance > radius:
            result["failure"] = "out_of_radius"
        else:
            result["validated"] = True
    return result


def validate_gps(data, visit):
    result = evaluate_gps(data, visit)
    if not result["validated"]:
        raise ValidationError(
            {"location": MESSAGES[result["failure"]], "failure": result["failure"]}
        )
    return result
