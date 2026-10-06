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
    from django.db.models import Exists, OuterRef
    from .models import Tienda, AsignacionTienda, CoberturaUsuario
    if not usuario.is_active:
        return Tienda.objects.none()
    if rol_de(usuario) == "administrator":
        return Tienda.objects.all()
    if rol_de(usuario) in ("technician", "account_supervisor"):
        # La subconsulta conserva cada pareja; nunca combina listas independientes.
        coverage = CoberturaUsuario.objects.filter(usuario=usuario, activo=True, zona__activo=True,
            cliente_id=OuterRef("cliente_id"), zona_id=OuterRef("zona_id"))
        return Tienda.objects.filter(activo=True).filter(Exists(coverage))
    if rol_de(usuario) == "store_supervisor":
        assignments = AsignacionTienda.objects.filter(usuario=usuario, activo=True)
        # Fail closed para registros legacy inconsistentes con más de una tienda.
        if assignments.count() != 1:
            return Tienda.objects.none()
        return Tienda.objects.filter(pk__in=assignments.values("tienda_id"))
    return Tienda.objects.none()


def tecnicos_elegibles_para(tienda):
    from django.db.models import Q
    from .models import Usuario
    if not tienda.zona_id or not tienda.activo:
        return Usuario.objects.none()
    return Usuario.objects.filter(Q(rol__nombre__iexact="Tecnico") | Q(rol__nombre__iexact="Técnico") | Q(rol__nombre__iexact="technician"),
        is_active=True, coberturas__activo=True, coberturas__zona__activo=True,
        coberturas__cliente_id=tienda.cliente_id, coberturas__zona_id=tienda.zona_id).select_related("rol").distinct()


def visitas_continuables_para(usuario):
    from .models import Visita
    if rol_de(usuario) != "technician" or not usuario.is_active:
        return Visita.objects.none()
    # Solo la ejecución propia iniciada; no amplía la cobertura de trabajos nuevos.
    return Visita.objects.filter(tecnico=usuario, vigente=True, iniciado_en__isnull=False,
        estado__in=("en_curso", "pendiente_validacion", "correccion_requerida"))
