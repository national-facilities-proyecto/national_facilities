from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .serializers import NfTokenObtainPairSerializer

from .views import (
    TiendaListView, EvidenciaListCreateView,
    VisitaPoolListView, VisitaTomarView, VisitaProgramadasListView,
    ChecklistSaveDraftView, VisitaStartView, VisitaCompleteView,
    VisitaLocationExceptionView, VisitaTimeExceptionView, VisitaReviewExceptionView,
    TicketListCreateView, TicketScheduleView, TecnicoListView,
    TiendaDetailView, VisitaDetailView, TicketDetailView, ReporteVisitasListView,
    CambiarPasswordView, EvidenciaDetailView, VisitaNoRealizadaView,
    DashboardView, ReporteVisitasExportView,
    ClienteViewSet, TiendaAdminViewSet, ContratoViewSet,
    PlantillaChecklistViewSet, ItemPlantillaViewSet, UsuarioViewSet,
)
class NfTokenObtainPairView(TokenObtainPairView):
    serializer_class = NfTokenObtainPairSerializer

app_name = "core"

router = DefaultRouter()
router.register("admin/clientes", ClienteViewSet, basename="admin-clientes")
router.register("admin/tiendas", TiendaAdminViewSet, basename="admin-tiendas")
router.register("admin/contratos", ContratoViewSet, basename="admin-contratos")
router.register("admin/plantillas", PlantillaChecklistViewSet, basename="admin-plantillas")
router.register("admin/items-plantilla", ItemPlantillaViewSet, basename="admin-items-plantilla")
router.register("admin/usuarios", UsuarioViewSet, basename="admin-usuarios")

urlpatterns = [
    path("auth/login/", NfTokenObtainPairView.as_view(), name="login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("tiendas/", TiendaListView.as_view(), name="tiendas-list"),
    path("evidencias/", EvidenciaListCreateView.as_view(), name="evidencias-list-create"),
    path("visitas/pool/", VisitaPoolListView.as_view(), name="visitas-pool"),
    path("visitas/pool/<int:pk>/tomar/", VisitaTomarView.as_view(), name="visita-tomar"),
    path("visitas/programadas/", VisitaProgramadasListView.as_view(), name="visitas-programadas"),
    path("visitas/<int:pk>/checklist/", ChecklistSaveDraftView.as_view(), name="visita-checklist"),
    path("visitas/<int:pk>/iniciar/", VisitaStartView.as_view(), name="visita-iniciar"),
    path("visitas/<int:pk>/completar/", VisitaCompleteView.as_view(), name="visita-completar"),
    path("visitas/<int:pk>/excepcion-ubicacion/", VisitaLocationExceptionView.as_view(), name="visita-excepcion-ubicacion"),
    path("visitas/<int:pk>/excepcion-tiempo/", VisitaTimeExceptionView.as_view(), name="visita-excepcion-tiempo"),
    path("visitas/<int:pk>/revisar-excepcion/", VisitaReviewExceptionView.as_view(), name="visita-revisar-excepcion"),
    path("tickets/", TicketListCreateView.as_view(), name="tickets-list-create"),
    path("tickets/<int:pk>/programar/", TicketScheduleView.as_view(), name="ticket-programar"),
    path("tecnicos/", TecnicoListView.as_view(), name="tecnicos-list"),
    path("tiendas/<int:pk>/", TiendaDetailView.as_view(), name="tiendas-detail"),
    path("visitas/<int:pk>/", VisitaDetailView.as_view(), name="visita-detail"),
    path("tickets/<int:pk>/", TicketDetailView.as_view(), name="ticket-detail"),
    path("reportes/visitas/", ReporteVisitasListView.as_view(), name="reporte-visitas"),
    path("auth/cambiar-password/", CambiarPasswordView.as_view(), name="cambiar-password"),
    path("evidencias/<int:pk>/", EvidenciaDetailView.as_view(), name="evidencia-detail"),
    path("visitas/<int:pk>/no-realizada/", VisitaNoRealizadaView.as_view(), name="visita-no-realizada"),
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("reportes/visitas/exportar/", ReporteVisitasExportView.as_view(), name="reporte-visitas-exportar"),
] + router.urls