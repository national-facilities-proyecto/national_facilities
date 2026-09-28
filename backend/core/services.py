from django.utils import timezone

from .models import Tienda, Visita


def asegurar_bolsa_mes_actual():
    """
    Crea la visita de checklist mensual (bolsa compartida, sin tecnico
    asignado) para cada tienda con contrato activo que todavia no tenga
    una este mes. Se llama automaticamente cada vez que un tecnico
    consulta la bolsa, asi no depende de un cron externo.
    """
    ahora = timezone.now()
    inicio_mes = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    tiendas = Tienda.objects.filter(cliente__contratos__activo=True).distinct()
    creadas = 0
    for tienda in tiendas:
        existe = Visita.objects.filter(
            tienda=tienda, origen="checklist", fecha_programada__gte=inicio_mes,
        ).exclude(estado="no_realizada").exists()
        if not existe:
            Visita.objects.create(
                tienda=tienda, origen="checklist", tecnico=None,
                fecha_programada=ahora, estado="programada",
            )
            creadas += 1
    return creadas