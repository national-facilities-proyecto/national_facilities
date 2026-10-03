from django.db import IntegrityError, OperationalError
from rest_framework.views import exception_handler
from .services import Conflict


def api_exception_handler(exc, context):
    # El bloque atomic de la acción ya se revirtió antes de llegar aquí.
    if isinstance(exc, IntegrityError):
        exc = Conflict("La operación entra en conflicto con un registro existente. Consulta el estado antes de reintentar.")
    elif isinstance(exc, OperationalError) and getattr(exc.__cause__, "pgcode", None) in ("40P01", "40001"):
        exc = Conflict("Otra operación concurrente modificó el recurso. Reintenta con la misma clave de operación.")
    return exception_handler(exc, context)
