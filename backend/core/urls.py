from django.urls import path
from rest_framework.routers import DefaultRouter
from . import views
from .auth_views import LoginView, RefreshView, LogoutView, MeView, PasswordView
from .evidence_views import EvidenceUploadView, EvidenceDetailView, EvidenceFileView
from .ticket_views import TicketListCreateView, TicketDetailView, ScheduleView, CloseTicketView
from .report_views import DashboardView, ExportView, ReportListView

app_name = "core"
router = DefaultRouter()
router.register("admin/clientes", views.ClienteViewSet, basename="admin-clientes")
router.register("admin/tiendas", views.TiendaAdminViewSet, basename="admin-tiendas")
router.register("admin/contratos", views.ContratoViewSet, basename="admin-contratos")
router.register("admin/plantillas", views.PlantillaChecklistViewSet, basename="admin-plantillas")
router.register("admin/items-plantilla", views.ItemPlantillaViewSet, basename="admin-items")
router.register("admin/usuarios", views.UsuarioViewSet, basename="admin-usuarios")
router.register("admin/zonas", views.ZonaViewSet, basename="admin-zonas")
router.register("admin/especialidades", views.CategoriaProblemaViewSet, basename="admin-especialidades")
router.register("admin/cliente-especialidades", views.ClienteEspecialidadViewSet, basename="admin-cliente-especialidades")

urlpatterns = [
    path("health/", views.HealthView.as_view(), name="health"),
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("reportes/exportar/", ExportView.as_view(), name="reportes-exportar"),
    path("reportes/", ReportListView.as_view(), name="reportes-list"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/refresh/", RefreshView.as_view(), name="token_refresh"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("auth/password/", PasswordView.as_view(), name="password"),
    path("tiendas/", views.TiendaListView.as_view(), name="tiendas-list"),
    path("tiendas/<int:pk>/", views.TiendaDetailView.as_view(), name="tiendas-detail"),
    path("usuarios/", views.UsersView.as_view(), name="usuarios-list"),
    path("catalogos/", views.CatalogsView.as_view(), name="catalogos-list"),
    path("checklists/generar/", views.GenerateMonthView.as_view(), name="checklists-generar"),
    path("checklists/", views.ChecklistListView.as_view(), name="checklists-list"),
    path("visitas/", views.VisitListView.as_view(), name="visitas-list"),
    path("visitas/pool/", views.VisitPoolListView.as_view(), name="visitas-pool"),
    path("visitas/programadas/", views.ScheduledVisitListView.as_view(), name="visitas-programadas"),
    path("visitas/<int:pk>/", views.VisitDetailView.as_view(), name="visita-detail"),
    path("visitas/pool/<int:pk>/tomar/", views.VisitActionView.as_view(action="claim"), name="visita-tomar"),
    path("visitas/<int:pk>/iniciar/", views.VisitActionView.as_view(action="start"), name="visita-iniciar"),
    path("visitas/<int:pk>/formulario/", views.VisitActionView.as_view(action="open_form"), name="visita-formulario"),
    path("visitas/<int:pk>/borrador/", views.VisitActionView.as_view(action="draft"), name="visita-borrador"),
    path("visitas/<int:pk>/finalizar/", views.VisitActionView.as_view(action="complete"), name="visita-finalizar"),
    path("visitas/<int:pk>/ubicacion-cierre/", views.VisitActionView.as_view(action="end_gps"), name="visita-ubicacion-cierre"),
    path("visitas/<int:pk>/excepciones/", views.ExceptionRequestView.as_view(), name="visita-excepciones"),
    path("visitas/<int:pk>/revisar/", views.ExceptionReviewView.as_view(), name="visita-revisar"),
    path("visitas/<int:pk>/enviar-revision/", views.VisitActionView.as_view(action="submit_review"), name="visita-enviar-revision"),
    path("tickets/", TicketListCreateView.as_view(), name="tickets-list-create"),
    path("tickets/<int:pk>/", TicketDetailView.as_view(), name="ticket-detail"),
    path("tickets/<int:pk>/programar/", ScheduleView.as_view(), name="ticket-programar"),
    path("tickets/<int:pk>/cerrar/", CloseTicketView.as_view(), name="ticket-cerrar"),
    path("evidencias/", EvidenceUploadView.as_view(), name="evidencias-list-create"),
    path("evidencias/<uuid:pk>/", EvidenceDetailView.as_view(), name="evidencia-detail-uuid"),
    path("evidencias/<uuid:pk>/archivo/", EvidenceFileView.as_view(), name="evidencia-archivo"),

    # URL de main que reutilizan los handlers del flujo vigente.
    path("visitas/<int:pk>/checklist/", views.VisitActionView.as_view(action="draft"), name="visita-checklist"),
    path("visitas/<int:pk>/completar/", views.VisitActionView.as_view(action="complete"), name="visita-completar"),
    path("visitas/<int:pk>/excepcion-ubicacion/", views.ExceptionRequestView.as_view(), name="visita-excepcion-ubicacion"),
    path("visitas/<int:pk>/excepcion-tiempo/", views.ExceptionRequestView.as_view(), name="visita-excepcion-tiempo"),
    path("visitas/<int:pk>/revisar-excepcion/", views.ExceptionReviewView.as_view(), name="visita-revisar-excepcion"),
    path("auth/cambiar-password/", PasswordView.as_view(), name="cambiar-password"),
    path("reportes/visitas/", ReportListView.as_view(), name="reporte-visitas"),
    path("reportes/visitas/exportar/", ExportView.as_view(), name="reporte-visitas-exportar"),

    # Rutas adicionales de main; los convertidores int y uuid son disjuntos.
    path("tecnicos/", views.TecnicoListView.as_view(), name="tecnicos-list"),
    path("evidencias/<int:pk>/", views.EvidenciaDetailView.as_view(), name="evidencia-detail"),
    path("visitas/<int:pk>/no-realizada/", views.VisitaNoRealizadaView.as_view(), name="visita-no-realizada"),
] + router.urls
