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

urlpatterns = [
    path("health/", views.HealthView.as_view()),
    path("dashboard/", DashboardView.as_view()),
    path("reportes/exportar/", ExportView.as_view()),
    path("reportes/", ReportListView.as_view()),
    path("auth/login/", LoginView.as_view()),
    path("auth/refresh/", RefreshView.as_view()),
    path("auth/logout/", LogoutView.as_view()),
    path("auth/me/", MeView.as_view()),
    path("auth/password/", PasswordView.as_view()),
    path("tiendas/", views.TiendaListView.as_view()),
    path("tiendas/<int:pk>/", views.TiendaDetailView.as_view()),
    path("usuarios/", views.UsersView.as_view()),
    path("catalogos/", views.CatalogsView.as_view()),
    path("checklists/generar/", views.GenerateMonthView.as_view()),
    path("checklists/", views.ChecklistListView.as_view()),
    path("visitas/", views.VisitListView.as_view()),
    path("visitas/pool/", views.VisitPoolListView.as_view()),
    path("visitas/programadas/", views.ScheduledVisitListView.as_view()),
    path("visitas/<int:pk>/", views.VisitDetailView.as_view()),
    path("visitas/pool/<int:pk>/tomar/", views.VisitActionView.as_view(action="claim")),
    path("visitas/<int:pk>/iniciar/", views.VisitActionView.as_view(action="start")),
    path("visitas/<int:pk>/formulario/", views.VisitActionView.as_view(action="open_form")),
    path("visitas/<int:pk>/borrador/", views.VisitActionView.as_view(action="draft")),
    path("visitas/<int:pk>/finalizar/", views.VisitActionView.as_view(action="complete")),
    path("visitas/<int:pk>/ubicacion-cierre/", views.VisitActionView.as_view(action="end_gps")),
    path("visitas/<int:pk>/excepciones/", views.ExceptionRequestView.as_view()),
    path("visitas/<int:pk>/revisar/", views.ExceptionReviewView.as_view()),
    path("visitas/<int:pk>/enviar-revision/", views.VisitActionView.as_view(action="submit_review")),
    path("tickets/", TicketListCreateView.as_view()),
    path("tickets/<int:pk>/", TicketDetailView.as_view()),
    path("tickets/<int:pk>/programar/", ScheduleView.as_view()),
    path("tickets/<int:pk>/cerrar/", CloseTicketView.as_view()),
    path("evidencias/", EvidenceUploadView.as_view()),
    path("evidencias/<uuid:pk>/", EvidenceDetailView.as_view()),
    path("evidencias/<uuid:pk>/archivo/", EvidenceFileView.as_view()),
] + router.urls
