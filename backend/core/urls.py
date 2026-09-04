from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import TiendaListView
from .views import EvidenciaListCreateView

app_name = "core"

urlpatterns = [
    path("auth/login/", TokenObtainPairView.as_view(), name="login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("tiendas/", TiendaListView.as_view(), name="tiendas-list"),
    path("evidencias/", EvidenciaListCreateView.as_view(), name="evidencias-list-create"),
]