from django.db import transaction
from rest_framework import status
from rest_framework.generics import ListAPIView, ListCreateAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from .models import (
    Evidencia, Visita, Cliente, Tienda, Contrato,
    PlantillaChecklist, ItemPlantilla, Usuario,
)
from .permissions import tiendas_visibles_para, EsTecnico, EsAdministrador
from .serializers import (
    TiendaSerializer, EvidenciaSerializer, VisitaSerializer,
    ClienteSerializer, TiendaAdminSerializer, ContratoSerializer,
    PlantillaChecklistSerializer, ItemPlantillaSerializer, UsuarioSerializer,
)


class TiendaListView(ListAPIView):
    serializer_class = TiendaSerializer

    def get_queryset(self):
        return tiendas_visibles_para(self.request.user)


class EvidenciaListCreateView(ListCreateAPIView):
    serializer_class = EvidenciaSerializer

    def get_queryset(self):
        return Evidencia.objects.filter(checklist__visita__tecnico=self.request.user)


class VisitaPoolListView(ListAPIView):
    """Bolsa compartida de checklist mensual: visible para cualquier tecnico."""
    serializer_class = VisitaSerializer
    permission_classes = [EsTecnico]

    def get_queryset(self):
        return Visita.objects.filter(origen="checklist", estado__in=["programada", "en_curso"])


class VisitaTomarView(APIView):
    """El tecnico reclama una visita de la bolsa compartida."""
    permission_classes = [EsTecnico]

    def post(self, request, pk):
        with transaction.atomic():
            try:
                visita = Visita.objects.select_for_update().get(pk=pk, origen="checklist")
            except Visita.DoesNotExist:
                return Response({"detail": "Visita no encontrada."}, status=status.HTTP_404_NOT_FOUND)

            if visita.tecnico is not None:
                return Response(
                    {"detail": "Esta visita ya fue tomada por otro tecnico."},
                    status=status.HTTP_409_CONFLICT,
                )

            visita.tecnico = request.user
            visita.estado = "en_curso"
            visita.save()

        return Response(VisitaSerializer(visita).data)


class VisitaProgramadasListView(ListAPIView):
    """Visitas generadas desde un ticket, asignadas especificamente a este tecnico."""
    serializer_class = VisitaSerializer
    permission_classes = [EsTecnico]

    def get_queryset(self):
        return Visita.objects.filter(origen="ticket", tecnico=self.request.user)


class ClienteViewSet(ModelViewSet):
    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer
    permission_classes = [EsAdministrador]


class TiendaAdminViewSet(ModelViewSet):
    queryset = Tienda.objects.all()
    serializer_class = TiendaAdminSerializer
    permission_classes = [EsAdministrador]


class ContratoViewSet(ModelViewSet):
    queryset = Contrato.objects.all()
    serializer_class = ContratoSerializer
    permission_classes = [EsAdministrador]


class PlantillaChecklistViewSet(ModelViewSet):
    queryset = PlantillaChecklist.objects.all()
    serializer_class = PlantillaChecklistSerializer
    permission_classes = [EsAdministrador]


class ItemPlantillaViewSet(ModelViewSet):
    queryset = ItemPlantilla.objects.all()
    serializer_class = ItemPlantillaSerializer
    permission_classes = [EsAdministrador]
    http_method_names = ["get", "post", "put", "patch", "head", "options"]  # nunca se borra


class UsuarioViewSet(ModelViewSet):
    queryset = Usuario.objects.all()
    serializer_class = UsuarioSerializer
    permission_classes = [EsAdministrador]