import unicodedata
from rest_framework.permissions import BasePermission

ROLES = {
    "tecnico": "technician", "technician": "technician",
    "supervisor de tienda": "store_supervisor", "store_supervisor": "store_supervisor",
    "supervisor de cuenta": "account_supervisor", "account_supervisor": "account_supervisor",
    "administrador": "administrator", "administrator": "administrator",
}


def rol_de(usuario):
    value = usuario.rol.nombre if usuario.rol_id else ""
    value = "".join(c for c in unicodedata.normalize("NFD", value) if not unicodedata.combining(c)).lower().strip()
    return ROLES.get(value)


class OperacionAutorizada(BasePermission):
    message = "La cuenta requiere cambio inicial de contraseña o carece de un rol válido."

    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and request.user.is_active and rol_de(request.user)
                    and (request.user.password_initialized or getattr(view, "allow_password_setup", False)))


class TienePermisoDeRol(OperacionAutorizada):
    roles_permitidos = ()

    def has_permission(self, request, view):
        return super().has_permission(request, view) and rol_de(request.user) in self.roles_permitidos


class EsTecnico(TienePermisoDeRol):
    roles_permitidos = ("technician",)


class EsAdministrador(TienePermisoDeRol):
    roles_permitidos = ("administrator",)


class EsSupervisorCuenta(TienePermisoDeRol):
    roles_permitidos = ("account_supervisor",)

class EsSupervisorDeTienda(TienePermisoDeRol):
    roles_permitidos = ("SupervisorTienda",)


class EsSupervisorDeCuenta(TienePermisoDeRol):
    roles_permitidos = ("SupervisorCuenta",)

def tiendas_visibles_para(usuario):
    from .models import Tienda, AsignacionTienda
    if rol_de(usuario) == "administrator":
        return Tienda.objects.all()
    ids = AsignacionTienda.objects.filter(usuario=usuario, activo=True).values("tienda_id")
    return Tienda.objects.filter(pk__in=ids)
