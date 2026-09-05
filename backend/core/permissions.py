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


def tiendas_visibles_para(usuario):
    """
    Devuelve el queryset de Tienda que el usuario puede ver según su rol.

    Administrador ve todas. Supervisor de cuenta y supervisor de tienda
    ven solo las tiendas con una AsignacionTienda activa a su nombre
    (ver docstring de AsignacionTienda en models.py).
    """
    from .models import Tienda

    if usuario.rol and usuario.rol.nombre == "Administrador":
        return Tienda.objects.all()

    return Tienda.objects.filter(
        usuarios_asignados__usuario=usuario,
        usuarios_asignados__activo=True,
    ).distinct()