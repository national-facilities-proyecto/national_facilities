from rest_framework.generics import ListAPIView
from rest_framework.generics import ListCreateAPIView

from .permissions import tiendas_visibles_para
from .serializers import TiendaSerializer

from .models import Evidencia
from .serializers import EvidenciaSerializer


class TiendaListView(ListAPIView):
    serializer_class = TiendaSerializer

    def get_queryset(self):
        return tiendas_visibles_para(self.request.user)

class EvidenciaListCreateView(ListCreateAPIView):
    serializer_class = EvidenciaSerializer

    def get_queryset(self):
        return Evidencia.objects.filter(checklist__visita__tecnico=self.request.user)