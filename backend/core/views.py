import csv

from django.db import transaction
from django.db.models import Avg, Count, Q, F, ExpressionWrapper, DurationField
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveAPIView, RetrieveDestroyAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet
from rest_framework_simplejwt.tokens import RefreshToken

from .geo import distancia_metros
from .services import asegurar_bolsa_mes_actual

from .models import (
    Evidencia, Visita, Cliente, Tienda, Contrato,
    PlantillaChecklist, ItemPlantilla, Usuario,
    Checklist, RespuestaItem, Ticket, ReasignacionTicket, NivelUrgencia,
)
from .permissions import (
    tiendas_visibles_para, EsTecnico, EsAdministrador,
    EsSupervisorDeTienda, EsSupervisorDeCuenta,
)
from .serializers import (
    TiendaSerializer, EvidenciaSerializer, VisitaSerializer, VisitaDetailSerializer,
    ClienteSerializer, TiendaAdminSerializer, ContratoSerializer,
    PlantillaChecklistSerializer, ItemPlantillaSerializer, UsuarioSerializer,
    TicketSerializer, TicketCreateSerializer, RESULTADO_DESDE_FRONTEND,
    ReporteVisitaSerializer, construir_datos_usuario,
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
        asegurar_bolsa_mes_actual()
        return Visita.objects.filter(origen="checklist", tecnico__isnull=True)

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

class ChecklistSaveDraftView(APIView):
    permission_classes = [EsTecnico]

    def post(self, request, pk):
        try:
            visita = Visita.objects.get(pk=pk, origen="checklist", tecnico=request.user)
        except Visita.DoesNotExist:
            return Response({"detail": "Visita no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        contrato = visita.tienda.cliente.contratos.filter(activo=True).order_by("-fecha_inicio").first()
        if contrato is None:
            return Response({"detail": "La tienda no tiene un contrato activo."}, status=status.HTTP_400_BAD_REQUEST)

        checklist, _ = Checklist.objects.get_or_create(
            visita=visita, defaults={"plantilla": contrato.plantilla_checklist}
        )
        checklist.reporte_general = request.data.get("workDescription", "")
        checklist.save()

        for respuesta in request.data.get("answers", []):
            resultado = RESULTADO_DESDE_FRONTEND.get(respuesta.get("result"))
            RespuestaItem.objects.update_or_create(
                checklist=checklist,
                item_id=respuesta.get("taskId"),
                defaults={"resultado": resultado, "observacion": respuesta.get("observation", "")},
            )

        return Response(VisitaDetailSerializer(visita).data)


class VisitaStartView(APIView):
    permission_classes = [EsTecnico]

    def post(self, request, pk):
        try:
            visita = Visita.objects.get(pk=pk, tecnico=request.user)
        except Visita.DoesNotExist:
            return Response({"detail": "Visita no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        lat, lon = request.data.get("latitude"), request.data.get("longitude")
        if lat is None or lon is None:
            return Response({"detail": "Falta la ubicacion."}, status=status.HTTP_400_BAD_REQUEST)

        contrato = visita.tienda.cliente.contratos.filter(activo=True).order_by("-fecha_inicio").first()
        radio = contrato.radio_validacion_metros if contrato else 100
        distancia = distancia_metros(lat, lon, visita.tienda.latitud, visita.tienda.longitud)

        visita.iniciada_en = timezone.now()
        visita.latitud_inicio = lat
        visita.longitud_inicio = lon
        visita.distancia_inicio_metros = distancia
        visita.proximidad_inicio_validada = distancia <= radio
        visita.estado = "en_curso"
        visita.save()

        return Response(VisitaDetailSerializer(visita).data)


class VisitaCompleteView(APIView):
    permission_classes = [EsTecnico]

    def post(self, request, pk):
        try:
            visita = Visita.objects.get(pk=pk, tecnico=request.user)
        except Visita.DoesNotExist:
            return Response({"detail": "Visita no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        lat, lon = request.data.get("latitude"), request.data.get("longitude")
        if lat is None or lon is None:
            return Response({"detail": "Falta la ubicacion."}, status=status.HTTP_400_BAD_REQUEST)

        contrato = visita.tienda.cliente.contratos.filter(activo=True).order_by("-fecha_inicio").first()
        radio = contrato.radio_validacion_metros if contrato else 100
        distancia = distancia_metros(lat, lon, visita.tienda.latitud, visita.tienda.longitud)
        validada = distancia <= radio

        visita.latitud_cierre = lat
        visita.longitud_cierre = lon
        visita.distancia_medida_metros = distancia
        visita.proximidad_validada = validada
        visita.completada_en = timezone.now()

        if visita.iniciada_en and (visita.completada_en - visita.iniciada_en).total_seconds() > 300:
            visita.excepcion_tiempo = True

        visita.estado = "completada" if validada else "pendiente_validacion"
        visita.save()

        if visita.origen == "ticket" and visita.ticket_origen:
            ticket = visita.ticket_origen
            ticket.estado = "resuelto"
            ticket.resuelto_en = timezone.now()
            ticket.save()

        return Response(VisitaDetailSerializer(visita).data)


class VisitaLocationExceptionView(APIView):
    permission_classes = [EsTecnico]

    def post(self, request, pk):
        try:
            visita = Visita.objects.get(pk=pk, tecnico=request.user)
        except Visita.DoesNotExist:
            return Response({"detail": "Visita no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        visita.excepcion_ubicacion = True
        visita.justificacion_excepcion = request.data.get("reason", "")
        visita.descripcion_fallo_ubicacion = request.data.get("failure", "")
        visita.completada_en = timezone.now()
        visita.estado = "pendiente_validacion"
        visita.save()

        return Response(VisitaDetailSerializer(visita).data)


class VisitaTimeExceptionView(APIView):
    permission_classes = [EsTecnico]

    def post(self, request, pk):
        try:
            visita = Visita.objects.get(pk=pk, tecnico=request.user)
        except Visita.DoesNotExist:
            return Response({"detail": "Visita no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        visita.excepcion_tiempo = True
        visita.justificacion_excepcion_tiempo = request.data.get("reason", "")
        visita.save()

        return Response(VisitaDetailSerializer(visita).data)


class VisitaReviewExceptionView(APIView):
    permission_classes = [EsSupervisorDeCuenta]

    def post(self, request, pk):
        try:
            visita = Visita.objects.get(pk=pk)
        except Visita.DoesNotExist:
            return Response({"detail": "Visita no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        approved = request.data.get("approved")
        comentario = request.data.get("reviewReason", "")

        if visita.excepcion_ubicacion and visita.excepcion_aprobada is None:
            visita.excepcion_aprobada = approved
            visita.excepcion_revisada_por = request.user
            visita.comentario_revision_ubicacion = comentario
            if approved:
                visita.estado = "completada"
        elif visita.excepcion_tiempo and visita.excepcion_tiempo_aprobada is None:
            visita.excepcion_tiempo_aprobada = approved
            visita.excepcion_tiempo_revisada_por = request.user
            visita.comentario_revision_tiempo = comentario

        visita.save()
        return Response(VisitaDetailSerializer(visita).data)


class TicketListCreateView(ListCreateAPIView):
    def get_serializer_class(self):
        return TicketCreateSerializer if self.request.method == "POST" else TicketSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [EsSupervisorDeTienda()]
        return super().get_permissions()

    def get_queryset(self):
        usuario = self.request.user
        rol = usuario.rol.nombre if usuario.rol else None
        if rol == "Administrador":
            return Ticket.objects.all()
        return Ticket.objects.filter(
            tienda__usuarios_asignados__usuario=usuario,
            tienda__usuarios_asignados__activo=True,
        )

    def get_serializer_context(self):
        return {"request": self.request}


class TicketScheduleView(APIView):
    permission_classes = [EsSupervisorDeCuenta]

    def post(self, request, pk):
        try:
            ticket = Ticket.objects.get(pk=pk)
        except Ticket.DoesNotExist:
            return Response({"detail": "Ticket no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        tecnico_id = request.data.get("technicianId")
        fecha = request.data.get("scheduledAt")
        prioridad = request.data.get("priority")

        if ticket.tecnico_asignado_id and ticket.tecnico_asignado_id != tecnico_id:
            ReasignacionTicket.objects.create(
                ticket=ticket, tecnico_anterior_id=ticket.tecnico_asignado_id,
                tecnico_nuevo_id=tecnico_id, reasignado_por=request.user,
            )

        ticket.tecnico_asignado_id = tecnico_id
        ticket.fecha_programada = fecha

        if not ticket.asignado_en:
            ticket.asignado_en = timezone.now()
        if prioridad:
            ticket.urgencia = NivelUrgencia.objects.get(nombre=prioridad)
        ticket.estado = "programado"
        ticket.save()

        Visita.objects.create(
            tienda=ticket.tienda, origen="ticket", tecnico_id=tecnico_id,
            ticket_origen=ticket, fecha_programada=fecha, estado="programada",
        )

        return Response(TicketSerializer(ticket).data)


class TecnicoListView(ListAPIView):
    serializer_class = UsuarioSerializer
    permission_classes = [EsSupervisorDeCuenta]

    def get_queryset(self):
        return Usuario.objects.filter(rol__nombre="Tecnico", is_active=True)

class TiendaDetailView(RetrieveAPIView):
    serializer_class = TiendaSerializer

    def get_queryset(self):
        return tiendas_visibles_para(self.request.user)


class VisitaDetailView(RetrieveAPIView):
    serializer_class = VisitaDetailSerializer

    def get_queryset(self):
        usuario = self.request.user
        rol = usuario.rol.nombre if usuario.rol else None
        if rol == "Administrador":
            return Visita.objects.all()
        if rol == "Tecnico":
            return Visita.objects.filter(tecnico=usuario)
        return Visita.objects.filter(
            tienda__usuarios_asignados__usuario=usuario,
            tienda__usuarios_asignados__activo=True,
        ).distinct()


class TicketDetailView(RetrieveAPIView):
    serializer_class = TicketSerializer

    def get_queryset(self):
        usuario = self.request.user
        rol = usuario.rol.nombre if usuario.rol else None
        if rol == "Administrador":
            return Ticket.objects.all()
        if rol == "Tecnico":
            return Ticket.objects.filter(tecnico_asignado=usuario)
        return Ticket.objects.filter(
            tienda__usuarios_asignados__usuario=usuario,
            tienda__usuarios_asignados__activo=True,
        )


class ReporteVisitasListView(ListAPIView):
    """Historial y trazabilidad de visitas, escalado por rol:
    tecnico ve las suyas; supervisores ven las tiendas que tienen asignadas;
    administrador ve todas. Filtros opcionales: ?tecnico=<id>&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
    """
    serializer_class = ReporteVisitaSerializer

    def get_queryset(self):
        usuario = self.request.user
        rol = usuario.rol.nombre if usuario.rol else None
        qs = Visita.objects.select_related("tienda", "tecnico").order_by("-fecha_programada")

        if rol == "Tecnico":
            qs = qs.filter(tecnico=usuario)
        elif rol in ("SupervisorCuenta", "SupervisorTienda"):
            qs = qs.filter(
                tienda__usuarios_asignados__usuario=usuario,
                tienda__usuarios_asignados__activo=True,
            ).distinct()
        elif rol != "Administrador":
            return qs.none()

        tecnico_id = self.request.query_params.get("tecnico")
        if tecnico_id:
            qs = qs.filter(tecnico_id=tecnico_id)
        desde = self.request.query_params.get("desde")
        if desde:
            qs = qs.filter(fecha_programada__date__gte=desde)
        hasta = self.request.query_params.get("hasta")
        if hasta:
            qs = qs.filter(fecha_programada__date__lte=hasta)

        return qs

class CambiarPasswordView(APIView):
    def post(self, request):
        nueva = request.data.get("password")
        if not nueva:
            return Response({"detail": "Falta la nueva contraseña."}, status=status.HTTP_400_BAD_REQUEST)

        usuario = request.user
        usuario.set_password(nueva)
        usuario.password_inicializada = True
        usuario.save()

        refresh = RefreshToken.for_user(usuario)
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": construir_datos_usuario(usuario),
        })


class EvidenciaDetailView(RetrieveDestroyAPIView):
    serializer_class = EvidenciaSerializer

    def get_queryset(self):
        usuario = self.request.user
        return Evidencia.objects.filter(
            Q(checklist__visita__tecnico=usuario) | Q(ticket__tecnico_asignado=usuario)
        )


class VisitaNoRealizadaView(APIView):
    permission_classes = [EsTecnico]

    def post(self, request, pk):
        try:
            visita = Visita.objects.get(pk=pk, tecnico=request.user)
        except Visita.DoesNotExist:
            return Response({"detail": "Visita no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        visita.estado = "no_realizada"
        visita.justificacion = request.data.get("reason", "")
        visita.save()

        return Response(VisitaDetailSerializer(visita).data)


class DashboardView(APIView):
    def get(self, request):
        usuario = request.user
        ahora = timezone.now()
        inicio_mes = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        tiendas_visibles = tiendas_visibles_para(usuario)
        total_tiendas = tiendas_visibles.count()
        visitas_mes = Visita.objects.filter(tienda__in=tiendas_visibles, fecha_programada__gte=inicio_mes)
        tickets_mes = Ticket.objects.filter(tienda__in=tiendas_visibles, creado_en__gte=inicio_mes)

        tiendas_con_checklist_cerrado = visitas_mes.filter(
            origen="checklist", estado="completada"
        ).values("tienda").distinct().count()
        kpi_01 = round(tiendas_con_checklist_cerrado / total_tiendas * 100, 1) if total_tiendas else None

        tiendas_bajo_minimo = 0
        for tienda in tiendas_visibles.select_related("cliente"):
            contrato = tienda.cliente.contratos.filter(activo=True).order_by("-fecha_inicio").first()
            if not contrato:
                continue
            cerrados = tickets_mes.filter(tienda=tienda, estado__in=["resuelto", "cerrado"]).count()
            if cerrados < contrato.minimo_intervenciones_mensual:
                tiendas_bajo_minimo += 1

        total_programadas = visitas_mes.count()
        no_realizadas = visitas_mes.filter(estado="no_realizada").count()
        kpi_03 = round(no_realizadas / total_programadas * 100, 1) if total_programadas else None

        tiendas_con_actividad = visitas_mes.filter(estado="completada").values("tienda").distinct().count()
        kpi_04 = round(tiendas_con_actividad / total_tiendas * 100, 1) if total_tiendas else None

        visitas_cerradas = visitas_mes.filter(estado__in=["completada", "pendiente_validacion"])
        total_cerradas = visitas_cerradas.count()
        con_proximidad = visitas_cerradas.filter(proximidad_validada=True).count()
        con_excepcion_ubicacion = visitas_cerradas.filter(excepcion_ubicacion=True).count()
        kpi_05 = round(con_proximidad / total_cerradas * 100, 1) if total_cerradas else None
        kpi_06 = round(con_excepcion_ubicacion / total_cerradas * 100, 1) if total_cerradas else None

        excepciones_pendientes = Visita.objects.filter(tienda__in=tiendas_visibles).filter(
            (Q(excepcion_ubicacion=True) & Q(excepcion_aprobada__isnull=True))
            | (Q(excepcion_tiempo=True) & Q(excepcion_tiempo_aprobada__isnull=True))
        ).count()

        kpi_08 = visitas_cerradas.aggregate(promedio=Avg("distancia_medida_metros"))["promedio"]

        duracion_respuesta = ExpressionWrapper(F("asignado_en") - F("creado_en"), output_field=DurationField())
        kpi_09_prom = tickets_mes.filter(asignado_en__isnull=False).annotate(
            duracion=duracion_respuesta
        ).aggregate(promedio=Avg("duracion"))["promedio"]
        kpi_09 = round(kpi_09_prom.total_seconds() / 3600, 1) if kpi_09_prom else None

        duracion_resolucion = ExpressionWrapper(F("resuelto_en") - F("creado_en"), output_field=DurationField())
        kpi_10_prom = tickets_mes.filter(resuelto_en__isnull=False).annotate(
            duracion=duracion_resolucion
        ).aggregate(promedio=Avg("duracion"))["promedio"]
        kpi_10 = round(kpi_10_prom.total_seconds() / 3600, 1) if kpi_10_prom else None

        tickets_cerrados = tickets_mes.filter(estado__in=["resuelto", "cerrado"])
        total_tickets_cerrados = tickets_cerrados.count()
        reasignados = tickets_cerrados.filter(reasignaciones__isnull=False).distinct().count()
        kpi_11 = round(reasignados / total_tickets_cerrados * 100, 1) if total_tickets_cerrados else None

        visitas_con_checklist = visitas_mes.filter(origen="checklist", estado="completada")
        completas, total_con_checklist = 0, 0
        for v in visitas_con_checklist:
            checklist = getattr(v, "checklist", None)
            if not checklist:
                continue
            total_con_checklist += 1
            items_requeridos = checklist.plantilla.items.filter(activo=True, foto_requerida=True)
            falta_alguna = any(
                not Evidencia.objects.filter(checklist=checklist, item=item).exists()
                for item in items_requeridos
            )
            if not falta_alguna:
                completas += 1
        kpi_13 = round(completas / total_con_checklist * 100, 1) if total_con_checklist else None

        carga_por_tecnico = list(
            visitas_mes.filter(estado="completada", tecnico__isnull=False)
            .values("tecnico__id", "tecnico__first_name", "tecnico__last_name", "tecnico__username")
            .annotate(total=Count("id"))
            .order_by("-total")
        )

        return Response({
            "kpi01CumplimientoChecklist": kpi_01,
            "kpi02TiendasBajoMinimo": tiendas_bajo_minimo,
            "kpi03VisitasNoEjecutadas": kpi_03,
            "kpi04CoberturaTiendas": kpi_04,
            "kpi05ValidacionUbicacion": kpi_05,
            "kpi06UsoExcepcionUbicacion": kpi_06,
            "kpi07ExcepcionesPendientes": excepciones_pendientes,
            "kpi08DistanciaMediaMetros": float(kpi_08) if kpi_08 is not None else None,
            "kpi09PrimeraRespuestaHoras": kpi_09,
            "kpi10ResolucionHoras": kpi_10,
            "kpi11TasaReasignacion": kpi_11,
            "kpi12AdopcionDigital": None,
            "kpi13CompletitudEvidencia": kpi_13,
            "kpi14CargaPorTecnico": carga_por_tecnico,
            "periodo": {"desde": inicio_mes.date().isoformat(), "hasta": ahora.date().isoformat()},
        })


class ReporteVisitasExportView(APIView):
    def get(self, request):
        usuario = request.user
        rol = usuario.rol.nombre if usuario.rol else None
        qs = Visita.objects.select_related("tienda", "tecnico").order_by("-fecha_programada")

        if rol == "Tecnico":
            qs = qs.filter(tecnico=usuario)
        elif rol in ("SupervisorCuenta", "SupervisorTienda"):
            qs = qs.filter(
                tienda__usuarios_asignados__usuario=usuario,
                tienda__usuarios_asignados__activo=True,
            ).distinct()
        elif rol != "Administrador":
            qs = qs.none()

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="reporte_visitas.csv"'
        writer = csv.writer(response)
        writer.writerow(["ID", "Tienda", "Tecnico", "Origen", "Fecha programada", "Estado", "Proximidad validada", "Distancia (m)"])
        for v in qs:
            writer.writerow([
                v.id,
                v.tienda.nombre,
                (v.tecnico.get_full_name() or v.tecnico.username) if v.tecnico else "",
                v.origen,
                v.fecha_programada,
                v.estado,
                v.proximidad_validada,
                v.distancia_medida_metros or "",
            ])
        return response