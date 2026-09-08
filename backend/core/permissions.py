from rest_framework.permissions import BasePermission


class TienePermisoDeRol(BasePermission):
    roles_permitidos = ()

    def has_permission(self, request, view):
        usuario = request.user
        return bool(
            usuario
            and usuario.is_authenticated
            and usuario.rol
            and usuario.rol.nombre in self.roles_permitidos
        )


class EsTecnico(TienePermisoDeRol):
    roles_permitidos = ("Tecnico",)


class EsAdministrador(TienePermisoDeRol):
    roles_permitidos = ("Administrador",)


def tiendas_visibles_para(usuario):
    """
    Devuelve el queryset de Tienda que el usuario puede ver según su rol.

    Administrador y tecnico ven todas las tiendas (el tecnico trabaja
    sobre la bolsa compartida de la cuenta, no tiene asignacion individual).
    Supervisor de cuenta y supervisor de tienda ven solo las tiendas con
    una AsignacionTienda activa a su nombre.
    """
    from .models import Tienda

    rol = usuario.rol.nombre if usuario.rol else None

    if rol in ("Administrador", "Tecnico"):
        return Tienda.objects.all()

    return Tienda.objects.filter(
        usuarios_asignados__usuario=usuario,
        usuarios_asignados__activo=True,
    ).distinct()