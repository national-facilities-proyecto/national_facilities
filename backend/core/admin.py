from django.contrib import admin

from .models import (
    Rol, Usuario, Cliente, Tienda, PlantillaChecklist, ItemPlantilla,
    Contrato, Visita, Checklist, RespuestaItem, Evidencia,
    CategoriaProblema, NivelUrgencia, Ticket,
)

admin.site.register(Rol)
admin.site.register(Usuario)
admin.site.register(Cliente)
admin.site.register(Tienda)
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