from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import (
    Rol, Usuario, Cliente, Tienda, AsignacionTienda, PlantillaChecklist, ItemPlantilla,
    Contrato, Visita, Checklist, RespuestaItem, Evidencia,
    CategoriaProblema, NivelUrgencia, Ticket, ReasignacionTicket,
)


class UsuarioAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ("Datos adicionales", {"fields": ("rol", "telefono")}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ("Datos adicionales", {"fields": ("rol", "telefono")}),
    )


admin.site.register(Rol)
admin.site.register(Usuario, UsuarioAdmin)
admin.site.register(Cliente)
admin.site.register(Tienda)
admin.site.register(AsignacionTienda)
admin.site.register(PlantillaChecklist)
admin.site.register(ItemPlantilla)
admin.site.register(Contrato)
admin.site.register(Visita)
admin.site.register(Checklist)
admin.site.register(RespuestaItem)
admin.site.register(Evidencia)
admin.site.register(CategoriaProblema)
admin.site.register(NivelUrgencia)
admin.site.register(Ticket)
admin.site.register(ReasignacionTicket)