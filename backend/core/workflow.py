"""Estado operativo común; asignación y programación conservan su historial."""
from datetime import timedelta

FORM_DURATION = timedelta(minutes=5)

VISIT_WORK_STATUS = {
    "programada": "pending",
    "en_curso": "in_progress",
    "pendiente_validacion": "in_review",
    "correccion_requerida": "correction_required",
    "completada": "finished",
    "no_realizada": "cancelled",
}
TICKET_WORK_STATUS = {
    "abierto": "pending",
    "programado": "pending",
    "en_proceso": "in_progress",
    "pendiente_validacion": "in_review",
    "correccion_requerida": "correction_required",
    "resuelto": "finished",
    "cerrado": "finished",
}
WORK_STATUS_LABELS = {
    "pending": "Pendiente",
    "in_progress": "En proceso",
    "in_review": "En revisión",
    "correction_required": "Corrección requerida",
    "finished": "Finalizado",
    "cancelled": "No realizada",
}
