from django.db import transaction
from django.db.models import Q, F
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework import serializers
from .models import (
    Cliente,
    Tienda,
    Contrato,
    PlantillaChecklist,
    ItemPlantilla,
    Usuario,
    CategoriaProblema,
    NivelUrgencia,
    Rol,
    Evento,
    Zona,
    ClienteEspecialidad,
)
from .permissions import (
    tiendas_visibles_para,
    tecnicos_elegibles_para,
    visitas_continuables_para,
    EsTecnico,
    EsAdministrador,
    EsSupervisorCuenta,
    rol_de,
)
from .serializers import (
    TiendaSerializer,
    ClienteSerializer,
    ContratoSerializer,
    PlantillaChecklistSerializer,
    ItemPlantillaSerializer,
    UsuarioSerializer,
    visit_data,
    visit_list_data,
    prepare_visit_audit,
    ZonaSerializer,
    CategoriaProblemaSerializer,
    ClienteEspecialidadSerializer,
)
from .auth_views import identity
from .evidence_views import (
    EvidenceDetailView,
    visible_evidence,
)
from .services import (
    idempotent,
    visible_visits,
    claim_visit,
    start_visit,
    open_form,
    save_draft,
    complete_visit,
    Conflict,
    validate_content,
    finish_physical_work,
    asegurar_bolsa_mes_actual,
    request_exception,
    review_exception,
    not_performed,
)
from .generation import generate_month
from .claims import release_expired_claims


class TiendaListView(ListAPIView):
    serializer_class = TiendaSerializer

    def get_queryset(self):
        return tiendas_visibles_para(self.request.user)


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        from django.db import connection, DatabaseError

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except DatabaseError:
            return Response({"status": "unavailable"}, status=503)
        return Response({"status": "ok"})


class TiendaDetailView(RetrieveAPIView):
    serializer_class = TiendaSerializer

    def get_queryset(self):
        return Tienda.objects.filter(
            Q(pk__in=tiendas_visibles_para(self.request.user).values("pk"))
            | Q(pk__in=visitas_continuables_para(self.request.user).values("tienda_id"))
        )


class UsersView(APIView):
    def get(self, request):
        role = rol_de(request.user)
        if role == "administrator":
            users = Usuario.objects.all()
        else:
            stores = tiendas_visibles_para(request.user)
            users = Usuario.objects.filter(
                Q(pk=request.user.pk)
                | Q(
                    coberturas__zona_id__in=stores.exclude(zona_id=None).values(
                        "zona_id"
                    ),
                    coberturas__activo=True,
                    coberturas__cliente_id=F("coberturas__zona__cliente_id"),
                )
                | Q(
                    tiendas_asignadas__tienda__in=stores, tiendas_asignadas__activo=True
                )
            ).distinct()
        scope = None if role == "administrator" else tiendas_visibles_para(request.user)
        return Response([identity(u, scope=scope) for u in users if rol_de(u)])


class CatalogsView(APIView):
    def get(self, request):
        categories = CategoriaProblema.objects.filter(activo=True)
        if rol_de(request.user) == "store_supervisor":
            categories = categories.filter(
                clientes_habilitados__activo=True,
                clientes_habilitados__cliente_id__in=tiendas_visibles_para(
                    request.user
                ).values("cliente_id"),
            ).distinct()
        return Response(
            {
                "categories": [{"id": c.pk, "name": c.nombre} for c in categories],
                "priorities": [
                    {
                        "id": c.pk,
                        "name": c.nombre,
                        "firstResponseHours": c.sla_primera_respuesta_horas,
                        "resolutionHours": c.sla_resolucion_horas,
                    }
                    for c in NivelUrgencia.objects.all()
                ],
                "roles": [{"id": r.pk, "name": r.nombre} for r in Rol.objects.all()],
            }
        )


class VisitListView(APIView):
    origin = None

    def get(self, request):
        visits = visible_visits(request.user).order_by("-fecha_programada", "pk")
        release_expired_claims(tiendas_visibles_para(request.user))
        if self.origin:
            visits = visits.filter(origen=self.origin)
        return Response(visit_list_data(visits, user=request.user))


class ChecklistListView(VisitListView):
    origin = "checklist"


class ScheduledVisitListView(VisitListView):
    origin = "ticket"


class VisitPoolListView(VisitListView):
    permission_classes = [EsTecnico]

    def get(self, request):
        asegurar_bolsa_mes_actual(request.user)
        return Response(
            visit_list_data(
                visible_visits(request.user).filter(
                    origen="checklist", tecnico__isnull=True, estado="programada"
                ),
                user=request.user,
            )
        )


class GenerateMonthInput(serializers.Serializer):
    period = serializers.DateField(required=False)

    def validate_period(self, value):
        from django.utils import timezone

        if value != timezone.localdate().replace(day=1):
            raise ValidationError(
                "La bolsa operativa se genera para el primer día del mes actual."
            )
        return value


class GenerateMonthView(APIView):
    permission_classes = [EsTecnico]

    def post(self, request):
        def work():
            serializer = GenerateMonthInput(data=request.data)
            serializer.is_valid(raise_exception=True)
            return {
                "visitIds": generate_month(
                    request.user, serializer.validated_data.get("period")
                )
            }

        return Response(idempotent(request, work))


class VisitDetailView(APIView):
    def get(self, request, pk):
        release_expired_claims(tiendas_visibles_para(request.user))
        return Response(
            visit_data(
                get_object_or_404(visible_visits(request.user), pk=pk),
                user=request.user,
            )
        )


class VisitActionView(APIView):
    permission_classes = [EsTecnico]
    action = ""

    def post(self, request, pk):
        # Fuera de la transacción idempotente: un inicio rechazado no revierte la liberación.
        if self.action in ("claim", "start"):
            release_expired_claims(tiendas_visibles_para(request.user))

        def work():
            if self.action == "claim":
                visit = claim_visit(request.user, pk)
            elif self.action == "start":
                visit = start_visit(request.user, pk, request.data)
            elif self.action == "open_form":
                visit = open_form(request.user, pk, request.data)
            elif self.action == "draft":
                visit = save_draft(request.user, pk, request.data)
            elif self.action == "complete":
                visit = complete_visit(request.user, pk, request.data)
            elif self.action == "physical_end":
                visit = finish_physical_work(request.user, pk, request.data)
            elif self.action == "submit_review":
                from .services import submit_review

                visit = submit_review(request.user, pk, request.data)
            else:
                raise ValidationError("Acción inválida.")
            return visit_data(visit, user=request.user)

        return Response(idempotent(request, work))


class ExceptionRequestView(APIView):
    permission_classes = [EsTecnico]
    exception_type = None

    def post(self, request, pk):
        def work():
            payload = request.data.copy()
            endpoint = request.path.rstrip("/").rsplit("/", 1)[-1]
            exception_type = self.exception_type or {
                "excepcion-ubicacion": "location",
                "excepcion-tiempo": "time_limit",
            }.get(endpoint)
            if exception_type:
                if payload.get("type") not in (None, exception_type):
                    raise ValidationError(
                        {"type": "El tipo de excepción no corresponde a esta ruta."}
                    )
                payload["type"] = exception_type
            visit = request_exception(request.user, pk, payload)
            return visit_data(visit, user=request.user)

        return Response(idempotent(request, work))


class ExceptionReviewView(APIView):
    permission_classes = [EsSupervisorCuenta]

    def post(self, request, pk):
        def work():
            visit = review_exception(request.user, pk, request.data)
            return visit_data(visit, user=request.user)

        return Response(idempotent(request, work))


class PendingReviewsView(APIView):
    permission_classes = [EsSupervisorCuenta]

    def get(self, request):
        # La integridad del contenido se comprueba además para registros legacy.
        visits = (
            visible_visits(request.user)
            .filter(
                estado__in=("pendiente_validacion", "correccion_requerida"),
                enviado_en__isnull=False,
                terminado_en__isnull=False,
                excepciones__decision="pending",
            )
            .distinct()
            .order_by("enviado_en", "pk")
        )
        result = []
        for visit in prepare_visit_audit(visits):
            try:
                validate_content(visit)
                from .services import validate_physical_end

                validate_physical_end(visit)
            except (ValidationError, Conflict):
                continue
            result.append(visit_data(visit, user=request.user, audit_prepared=True))
        return Response(result)


class WorkRecoveryView(APIView):
    permission_classes = [EsTecnico]

    def get(self, request):
        release_expired_claims(tiendas_visibles_para(request.user))
        visits = visible_visits(request.user).filter(tecnico=request.user, vigente=True)
        active = visits.filter(
            iniciado_en__isnull=False,
            enviado_en__isnull=True,
            estado__in=("en_curso", "pendiente_validacion"),
        ).first()
        return Response(
            {
                "activeExecution": (
                    visit_data(active, user=request.user) if active else None
                ),
                "reservations": visit_list_data(
                    visits.filter(
                        origen="checklist",
                        estado="programada",
                        iniciado_en__isnull=True,
                    ),
                    user=request.user,
                ),
                "corrections": visit_list_data(
                    visits.filter(estado="correccion_requerida"), user=request.user
                ),
                "inReview": visit_list_data(
                    visits.filter(
                        estado="pendiente_validacion", enviado_en__isnull=False
                    ),
                    user=request.user,
                ),
            }
        )


class AdminViewSet(ModelViewSet):
    permission_classes = [EsAdministrador]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def create(self, request, *args, **kwargs):
        def work():
            self.lock_parent(request.data)
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            self.audit(
                request.user,
                "admin_create",
                serializer.instance.pk,
                None,
                serializer.data,
            )
            return serializer.data

        return Response(idempotent(request, work), status=201)

    def update(self, request, *args, **kwargs):
        def work():
            instance = get_object_or_404(
                self.get_queryset().select_for_update(), pk=kwargs["pk"]
            )
            previous = self.get_serializer(instance).data
            parent_data = dict(request.data)
            if isinstance(instance, (Zona, ClienteEspecialidad)):
                parent_data.setdefault("clientId", instance.cliente_id)
            if isinstance(instance, Tienda):
                parent_data.setdefault("zoneId", instance.zona_id)
            self.lock_parent(parent_data)
            serializer = self.get_serializer(
                instance, data=request.data, partial=kwargs.get("partial", False)
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            self.audit(
                request.user, "admin_update", instance.pk, previous, serializer.data
            )
            return serializer.data

        return Response(idempotent(request, work))

    def lock_parent(self, data):
        if self.queryset.model in (Contrato, Zona, ClienteEspecialidad) and data.get(
            "clientId"
        ):
            try:
                client_id = serializers.IntegerField(min_value=1).run_validation(
                    data["clientId"]
                )
            except serializers.ValidationError as exc:
                raise ValidationError({"clientId": exc.detail})
            get_object_or_404(Cliente.objects.select_for_update(), pk=client_id)
        if self.queryset.model == Tienda and data.get("zoneId"):
            try:
                zone_id = serializers.IntegerField(min_value=1).run_validation(
                    data["zoneId"]
                )
            except serializers.ValidationError as exc:
                raise ValidationError({"zoneId": exc.detail})
            get_object_or_404(Zona.objects.select_for_update(), pk=zone_id)

    def audit(self, actor, kind, pk, previous, current):
        from rest_framework.renderers import JSONRenderer
        import json

        data = {
            "entity": self.queryset.model.__name__,
            "id": pk,
            "previous": previous,
            "next": current,
        }
        Evento.objects.create(
            actor=actor,
            tipo=kind,
            texto="Administración: " + self.queryset.model.__name__,
            datos=json.loads(JSONRenderer().render(data)),
        )

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        instance = get_object_or_404(
            self.get_queryset().select_for_update(), pk=kwargs["pk"]
        )
        previous = self.get_serializer(instance).data
        pk = instance.pk
        if isinstance(instance, Usuario) and instance.pk == request.user.pk:
            raise Conflict("No puedes eliminar tu propia cuenta.")
        if isinstance(
            instance, (ItemPlantilla, Zona, CategoriaProblema, ClienteEspecialidad)
        ):
            instance.activo = False
            instance.save(update_fields=["activo"])
        else:
            try:
                instance.delete()
            except ProtectedError:
                raise Conflict(
                    "El registro tiene historial protegido; desactívalo para conservar la trazabilidad."
                )
        self.audit(request.user, "admin_delete", pk, previous, None)
        return Response(status=204)


class ClienteViewSet(AdminViewSet):
    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer


class TiendaAdminViewSet(AdminViewSet):
    queryset = Tienda.objects.all()
    serializer_class = TiendaSerializer


class ZonaViewSet(AdminViewSet):
    queryset = Zona.objects.all()
    serializer_class = ZonaSerializer


class CategoriaProblemaViewSet(AdminViewSet):
    queryset = CategoriaProblema.objects.all()
    serializer_class = CategoriaProblemaSerializer


class ClienteEspecialidadViewSet(AdminViewSet):
    queryset = ClienteEspecialidad.objects.all()
    serializer_class = ClienteEspecialidadSerializer


class ContratoViewSet(AdminViewSet):
    queryset = Contrato.objects.all()
    serializer_class = ContratoSerializer


class PlantillaChecklistViewSet(AdminViewSet):
    queryset = PlantillaChecklist.objects.all()
    serializer_class = PlantillaChecklistSerializer


class ItemPlantillaViewSet(AdminViewSet):
    queryset = ItemPlantilla.objects.all()
    serializer_class = ItemPlantillaSerializer
    http_method_names = ["get", "head", "options"]


class UsuarioViewSet(AdminViewSet):
    queryset = Usuario.objects.all()
    serializer_class = UsuarioSerializer


class TecnicoListView(APIView):
    permission_classes = [EsSupervisorCuenta]

    def get(self, request):
        stores = tiendas_visibles_para(self.request.user)
        store_id = request.query_params.get("storeId")
        if store_id is not None:
            try:
                legacy = Tienda.objects.filter(
                    zona_id=None,
                    activo=True,
                    cliente_id__in=request.user.coberturas.filter(
                        activo=True, zona__activo=True
                    ).values("cliente_id"),
                )
                store = get_object_or_404(
                    Tienda.objects.filter(
                        Q(pk__in=stores.values("pk")) | Q(pk__in=legacy.values("pk"))
                    ),
                    pk=int(store_id),
                )
            except ValueError:
                raise ValidationError({"storeId": "Selecciona una tienda válida."})
            candidates = tecnicos_elegibles_para(store)
            scope = stores.filter(pk=store.pk)
        else:
            candidates = Usuario.objects.filter(
                is_active=True,
                coberturas__activo=True,
                coberturas__zona__activo=True,
                coberturas__zona_id__in=stores.exclude(zona_id=None).values("zona_id"),
                coberturas__cliente_id=F("coberturas__zona__cliente_id"),
            ).distinct()
            scope = stores
        return Response(
            [
                identity(user, scope=scope)
                for user in candidates
                if rol_de(user) == "technician"
            ]
        )


class EvidenciaDetailView(EvidenceDetailView):
    """El ID numérico de main usa la misma lectura y eliminación protegida del PR."""

    def client_id(self, request, pk):
        return get_object_or_404(visible_evidence(request.user), pk=pk).client_id

    def get(self, request, pk):
        return super().get(request, self.client_id(request, pk))

    def delete(self, request, pk):
        return super().delete(request, self.client_id(request, pk))


class VisitaNoRealizadaView(APIView):
    def post(self, request, pk):
        def work():
            visit = not_performed(request.user, pk, request.data)
            return visit_data(visit, user=request.user)

        return Response(idempotent(request, work))


# Nombres de main que comparten la implementación del flujo vigente.
VisitaPoolListView = VisitPoolListView
VisitaProgramadasListView = ScheduledVisitListView
VisitaDetailView = VisitDetailView
VisitaReviewExceptionView = ExceptionReviewView


class VisitaTomarView(VisitActionView):
    action = "claim"


class ChecklistSaveDraftView(VisitActionView):
    action = "draft"


class VisitaStartView(VisitActionView):
    action = "start"


class VisitaCompleteView(VisitActionView):
    action = "complete"


class VisitaLocationExceptionView(ExceptionRequestView):
    exception_type = "location"


class VisitaTimeExceptionView(ExceptionRequestView):
    exception_type = "time_limit"
