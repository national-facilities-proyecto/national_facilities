"""Estado operativo común; asignación y programación conservan su historial."""

VISIT_WORK_STATUS = {
    "programada": "pending",
    "en_curso": "in_progress",
    "pendiente_validacion": "in_review",
    "completada": "finished",
    "no_realizada": "cancelled",
}
TICKET_WORK_STATUS = {
    "abierto": "pending",
    "programado": "pending",
    "en_proceso": "in_progress",
    "pendiente_validacion": "in_review",
    "resuelto": "finished",
    "cerrado": "finished",
}
WORK_STATUS_LABELS = {
    "pending": "Pendiente",
    "in_progress": "En proceso",
    "in_review": "En revisión",
    "finished": "Finalizado",
    "cancelled": "No realizada",
}
