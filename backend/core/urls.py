from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (
    TiendaListView, EvidenciaListCreateView,
    VisitaPoolListView, VisitaTomarView, VisitaProgramadasListView,
    ClienteViewSet, TiendaAdminViewSet, ContratoViewSet,
    PlantillaChecklistViewSet, ItemPlantillaViewSet, UsuarioViewSet,
)

app_name = "core"

router = DefaultRouter()
router.register("admin/clientes", ClienteViewSet, basename="admin-clientes")
router.register("admin/tiendas", TiendaAdminViewSet, basename="admin-tiendas")
router.register("admin/contratos", ContratoViewSet, basename="admin-contratos")
router.register("admin/plantillas", PlantillaChecklistViewSet, basename="admin-plantillas")
router.register("admin/items-plantilla", ItemPlantillaViewSet, basename="admin-items-plantilla")
router.register("admin/usuarios", UsuarioViewSet, basename="admin-usuarios")

urlpatterns = [
    path("auth/login/", TokenObtainPairView.as_view(), name="login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("tiendas/", TiendaListView.as_view(), name="tiendas-list"),
    path("evidencias/", EvidenciaListCreateView.as_view(), name="evidencias-list-create"),
    path("visitas/pool/", VisitaPoolListView.as_view(), name="visitas-pool"),
    path("visitas/pool/<int:pk>/tomar/", VisitaTomarView.as_view(), name="visita-tomar"),
    path("visitas/programadas/", VisitaProgramadasListView.as_view(), name="visitas-programadas"),
] + router.urls