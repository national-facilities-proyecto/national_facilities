from django.contrib import admin
from django.core.exceptions import PermissionDenied
from . import models
from .permissions import rol_de


class InspectionSite(admin.AdminSite):
    def has_permission(self, request):
        return (super().has_permission(request) and request.user.password_initialized
                and rol_de(request.user) == "administrator")

    def password_change(self, request, extra_context=None):
        raise PermissionDenied("Cambia la contraseña desde el portal para validar y revocar las sesiones correctamente.")


inspection_site = InspectionSite(name="admin")


class InspectionAdmin(admin.ModelAdmin):
    """El portal/API centraliza las escrituras y su auditoría; aquí se inspeccionan."""

    def has_view_permission(self, request, obj=None):
        return (request.user.is_active and request.user.is_staff
                and request.user.password_initialized
                and rol_de(request.user) == "administrator")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


for model in (
    models.Rol, models.Usuario, models.Cliente, models.Tienda, models.AsignacionTienda,
    models.PlantillaChecklist, models.ItemPlantilla, models.Contrato, models.Visita,
    models.Checklist, models.RespuestaItem, models.Evidencia, models.CategoriaProblema,
    models.NivelUrgencia, models.Ticket, models.ReasignacionTicket, models.Excepcion,
    models.Evento, models.Operacion,
):
    inspection_site.register(model, InspectionAdmin)
