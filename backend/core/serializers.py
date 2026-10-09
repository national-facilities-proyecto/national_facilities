from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q, Prefetch, prefetch_related_objects
from rest_framework import serializers
from rest_framework.validators import UniqueValidator
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import (
    Cliente,
    Tienda,
    Contrato,
    PlantillaChecklist,
    ItemPlantilla,
    Usuario,
    Rol,
    AsignacionTienda,
    Visita,
    Ticket,
    Evidencia,
    Excepcion,
    Evento,
    CategoriaProblema,
    NivelUrgencia,
    Zona,
    CoberturaUsuario,
    ClienteEspecialidad,
)
from .permissions import ROLES, rol_de
from .auth_views import identity
from .services import evidence_ids
from .workflow import VISIT_WORK_STATUS, TICKET_WORK_STATUS

# Una sola representación de identidad para ambos flujos de autenticación.
construir_datos_usuario = identity


class NfTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["version"] = user.auth_version
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = construir_datos_usuario(self.user)
        return data


class EvidenciaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Evidencia
        fields = [
            "id",
            "checklist",
            "ticket",
            "item",
            "foto",
            "descripcion",
            "subida_en",
        ]
        read_only_fields = ["subida_en"]

    def validate_checklist(self, checklist):
        usuario = self.context["request"].user
        if checklist and checklist.visita.tecnico != usuario:
            raise serializers.ValidationError(
                "No puedes subir evidencia a un checklist que no es tuyo."
            )
        return checklist


class ClienteSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="razon_social", max_length=200)
    taxId = serializers.CharField(
        source="ruc",
        max_length=20,
        validators=[UniqueValidator(queryset=Cliente.objects.all())],
    )
    email = serializers.EmailField(source="contacto_email", allow_blank=True)

    class Meta:
        model = Cliente
        fields = ["id", "name", "taxId", "email"]
        extra_kwargs = {"id": {"read_only": True}}


class TiendaSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="nombre", max_length=150)
    address = serializers.CharField(source="direccion", max_length=250)
    latitude = serializers.DecimalField(
        source="latitud", max_digits=9, decimal_places=6, min_value=-90, max_value=90
    )
    longitude = serializers.DecimalField(
        source="longitud", max_digits=9, decimal_places=6, min_value=-180, max_value=180
    )
    clientId = serializers.PrimaryKeyRelatedField(
        source="cliente", queryset=Cliente.objects.all()
    )
    zoneId = serializers.PrimaryKeyRelatedField(
        source="zona", queryset=Zona.objects.all(), allow_null=True, required=False
    )
    contact = serializers.CharField(
        source="contacto", max_length=200, allow_blank=True, required=False, default=""
    )
    active = serializers.BooleanField(source="activo")

    class Meta:
        model = Tienda
        fields = [
            "id",
            "name",
            "address",
            "latitude",
            "longitude",
            "clientId",
            "zoneId",
            "contact",
            "active",
        ]

    def validate(self, attrs):
        if (
            self.instance
            and "cliente" in attrs
            and attrs["cliente"].pk != self.instance.cliente_id
        ):
            if self.instance.visitas.exists() or self.instance.tickets.exists():
                raise serializers.ValidationError(
                    {
                        "clientId": "No puede cambiarse el cliente de una tienda con historial."
                    }
                )
        client = attrs.get("cliente", self.instance.cliente if self.instance else None)
        zone = attrs.get("zona", self.instance.zona if self.instance else None)
        if not self.instance and zone is None:
            raise serializers.ValidationError(
                {"zoneId": "Selecciona una zona para la nueva tienda."}
            )
        if self.instance and "zona" in attrs and zone is None and self.instance.zona_id:
            raise serializers.ValidationError(
                {"zoneId": "Una tienda V2 debe conservar una zona."}
            )
        if self.instance and client.pk != self.instance.cliente_id and zone is None:
            raise serializers.ValidationError(
                {"zoneId": "Selecciona una zona del nuevo cliente."}
            )
        if zone and client and zone.cliente_id != client.pk:
            raise serializers.ValidationError(
                {"zoneId": "La zona debe pertenecer al mismo cliente."}
            )
        return attrs


TiendaAdminSerializer = TiendaSerializer


class ZonaSerializer(serializers.ModelSerializer):
    clientId = serializers.PrimaryKeyRelatedField(
        source="cliente", queryset=Cliente.objects.all()
    )
    name = serializers.CharField(source="nombre", max_length=150)
    active = serializers.BooleanField(source="activo")

    class Meta:
        model = Zona
        fields = ["id", "clientId", "name", "active"]

    def validate(self, attrs):
        client = attrs.get("cliente", self.instance.cliente if self.instance else None)
        name = attrs.get("nombre", self.instance.nombre if self.instance else None)
        if (
            Zona.objects.filter(cliente=client, nombre=name)
            .exclude(pk=self.instance.pk if self.instance else None)
            .exists()
        ):
            raise serializers.ValidationError(
                {"name": "Ya existe una zona con este nombre en el cliente."}
            )
        candidate = Zona(
            pk=self.instance.pk if self.instance else None, cliente=client, nombre=name
        )
        try:
            candidate.clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"clientId": exc.messages})
        return attrs


class CategoriaProblemaSerializer(serializers.ModelSerializer):
    name = serializers.CharField(
        source="nombre",
        max_length=100,
        validators=[UniqueValidator(queryset=CategoriaProblema.objects.all())],
    )
    active = serializers.BooleanField(source="activo")

    class Meta:
        model = CategoriaProblema
        fields = ["id", "name", "active"]


class ClienteEspecialidadSerializer(serializers.ModelSerializer):
    clientId = serializers.PrimaryKeyRelatedField(
        source="cliente", queryset=Cliente.objects.all()
    )
    categoryId = serializers.PrimaryKeyRelatedField(
        source="categoria", queryset=CategoriaProblema.objects.all()
    )
    active = serializers.BooleanField(source="activo")

    class Meta:
        model = ClienteEspecialidad
        fields = ["id", "clientId", "categoryId", "active"]

    def validate(self, attrs):
        client = attrs.get("cliente", self.instance.cliente if self.instance else None)
        category = attrs.get(
            "categoria", self.instance.categoria if self.instance else None
        )
        if (
            ClienteEspecialidad.objects.filter(cliente=client, categoria=category)
            .exclude(pk=self.instance.pk if self.instance else None)
            .exists()
        ):
            raise serializers.ValidationError(
                {
                    "categoryId": "La especialidad ya tiene una habilitación para este cliente; edítala."
                }
            )
        return attrs


class CoberturaInputSerializer(serializers.Serializer):
    clientId = serializers.PrimaryKeyRelatedField(queryset=Cliente.objects.all())
    zoneId = serializers.PrimaryKeyRelatedField(queryset=Zona.objects.all())

    def validate(self, attrs):
        if attrs["zoneId"].cliente_id != attrs["clientId"].pk:
            raise serializers.ValidationError(
                {"zoneId": "La zona debe pertenecer al mismo cliente."}
            )
        return attrs


class RoleField(serializers.Field):
    def to_representation(self, value):
        return ROLES.get(value.nombre.lower())

    def to_internal_value(self, value):
        if value not in (
            "technician",
            "store_supervisor",
            "account_supervisor",
            "administrator",
        ):
            raise serializers.ValidationError("Rol inválido.")
        names = {
            "technician": "Tecnico",
            "store_supervisor": "Supervisor de tienda",
            "account_supervisor": "Supervisor de cuenta",
            "administrator": "Administrador",
        }
        return Rol.objects.get_or_create(nombre=names[value])[0]


class UsernameField(serializers.CharField):
    def to_internal_value(self, data):
        if isinstance(data, str) and any(char.isspace() for char in data):
            raise serializers.ValidationError("El nombre de usuario no puede contener espacios.")
        return super().to_internal_value(data)


class UsuarioSerializer(serializers.ModelSerializer):
    username = UsernameField(
        max_length=150,
        trim_whitespace=False,
        validators=[
            UnicodeUsernameValidator(message="Usa letras, números o los caracteres @ . + - _ en el nombre de usuario."),
            UniqueValidator(queryset=Usuario.objects.all(), message="Ya existe un usuario con este nombre de acceso."),
        ],
    )
    name = serializers.CharField(source="first_name", max_length=150)
    role = RoleField(source="rol")
    active = serializers.BooleanField(source="is_active")
    passwordInitialized = serializers.BooleanField(
        source="password_initialized", read_only=True
    )
    storeIds = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Tienda.objects.all(), write_only=True, required=False
    )
    coverages = CoberturaInputSerializer(many=True, required=False, write_only=True)
    password = serializers.CharField(
        write_only=True, required=False, min_length=8, trim_whitespace=False
    )

    class Meta:
        model = Usuario
        fields = [
            "id",
            "username",
            "name",
            "email",
            "role",
            "active",
            "passwordInitialized",
            "storeIds",
            "coverages",
            "password",
        ]
        extra_kwargs = {
            "username": {"required": True},
            "email": {"required": False, "allow_blank": True},
        }

    def to_representation(self, instance):
        return identity(instance)

    def validate(self, attrs):
        user = self.instance or Usuario()
        if not self.instance and not attrs.get("password"):
            raise serializers.ValidationError(
                {"password": "Contraseña inicial obligatoria."}
            )
        if self.instance and self.instance.pk == self.context["request"].user.pk:
            if attrs.get("is_active") is False or (
                "rol" in attrs and attrs["rol"].nombre != self.instance.rol.nombre
            ):
                raise serializers.ValidationError(
                    {
                        "role": "No puedes desactivar tu cuenta o quitarte el rol administrador."
                    }
                )
        ids = attrs.get(
            "storeIds",
            (
                [
                    a.tienda
                    for a in user.tiendas_asignadas.filter(activo=True).select_related(
                        "tienda"
                    )
                ]
                if user.pk
                else []
            ),
        )
        role = attrs.get("rol", user.rol if user.pk else None)
        role_key = ROLES.get(role.nombre.lower()) if role else None
        coverage = attrs.get(
            "coverages",
            (
                [
                    {"clientId": c.cliente, "zoneId": c.zona}
                    for c in user.coberturas.filter(activo=True).select_related(
                        "cliente", "zona"
                    )
                ]
                if user.pk
                else []
            ),
        )
        if role_key == "store_supervisor" and len(ids) != 1:
            raise serializers.ValidationError(
                {"storeIds": "Asigna exactamente una tienda al supervisor de tienda."}
            )
        if len({store.pk for store in ids}) != len(ids) and "storeIds" in attrs:
            raise serializers.ValidationError({"storeIds": "No repitas tiendas."})
        if role_key in ("technician", "account_supervisor"):
            if attrs.get("storeIds"):
                raise serializers.ValidationError(
                    {
                        "storeIds": "Este rol se administra mediante coberturas Cliente + Zona."
                    }
                )
            if not coverage:
                raise serializers.ValidationError(
                    {"coverages": "Añade al menos una cobertura Cliente + Zona."}
                )
        elif attrs.get("coverages"):
            raise serializers.ValidationError(
                {"coverages": "Este rol no utiliza cobertura operativa."}
            )
        if role_key == "administrator" and attrs.get("storeIds"):
            raise serializers.ValidationError(
                {"storeIds": "El administrador tiene alcance global."}
            )
        pairs = [(c["clientId"].pk, c["zoneId"].pk) for c in coverage]
        if len(set(pairs)) != len(pairs):
            raise serializers.ValidationError(
                {"coverages": "No repitas parejas Cliente + Zona."}
            )
        password = attrs.get("password")
        if password:
            for field in ("username", "first_name", "email"):
                setattr(user, field, attrs.get(field, getattr(user, field)))
            try:
                validate_password(password, user)
            except DjangoValidationError as exc:
                raise serializers.ValidationError({"password": exc.messages})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        stores = validated_data.pop("storeIds", [])
        coverage = validated_data.pop("coverages", [])
        password = validated_data.pop("password")
        user = Usuario(**validated_data)
        self.check_store_supervisor(user, stores)
        user.set_password(password)
        user.save()
        self.assign(
            user,
            stores if ROLES.get(user.rol.nombre.lower()) == "store_supervisor" else [],
        )
        self.assign_coverages(user, coverage)
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        stores = validated_data.pop("storeIds", None)
        coverage = validated_data.pop("coverages", None)
        password = validated_data.pop("password", None)
        old_role = instance.rol_id
        old_active = instance.is_active
        stores_changed = stores is not None and set(s.pk for s in stores) != set(
            instance.tiendas_asignadas.filter(activo=True).values_list(
                "tienda_id", flat=True
            )
        )
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
            instance.password_initialized = False
        next_role = ROLES.get(instance.rol.nombre.lower())
        if next_role != "store_supervisor":
            stores = []
            # Las asignaciones legacy dejan de ser autoridad para estos roles.
            stores_changed = False
        if next_role not in ("technician", "account_supervisor"):
            coverage = []
        self.check_store_supervisor(
            instance,
            stores if stores is not None else list(
                instance.tiendas_asignadas.filter(activo=True)
                .values_list("tienda_id", flat=True)
            ),
        )
        old_pairs = set(
            instance.coberturas.filter(activo=True).values_list("cliente_id", "zona_id")
        )
        coverage_changed = (
            coverage is not None
            and {(c["clientId"].pk, c["zoneId"].pk) for c in coverage} != old_pairs
        )
        if (
            password
            or instance.rol_id != old_role
            or instance.is_active != old_active
            or stores_changed
            or coverage_changed
        ):
            instance.auth_version += 1
        instance.save()
        if stores is not None:
            self.assign(instance, stores)
        if coverage is not None:
            self.assign_coverages(instance, coverage)
        return instance

    def check_store_supervisor(self, user, stores):
        if not user.is_active or rol_de(user) != "store_supervisor":
            return
        ids = [store.pk if isinstance(store, Tienda) else store for store in stores]
        # El bloqueo de tienda serializa altas, reasignaciones y reactivaciones.
        # No basta con consultar antes del save: dos solicitudes pueden ver la tienda libre.
        list(Tienda.objects.select_for_update().filter(pk__in=ids).order_by("pk"))
        assignments = AsignacionTienda.objects.filter(
            tienda_id__in=ids, activo=True, usuario__is_active=True
        ).exclude(usuario_id=user.pk).select_related("usuario__rol")
        if any(rol_de(assignment.usuario) == "store_supervisor" for assignment in assignments):
            raise serializers.ValidationError({
                "storeIds": "La tienda ya está asignada a un supervisor de tienda activo."
            })

    def assign(self, user, stores):
        ids = [s.pk for s in stores]
        user.tiendas_asignadas.exclude(tienda_id__in=ids).update(activo=False)
        for store in stores:
            AsignacionTienda.objects.update_or_create(
                usuario=user, tienda=store, defaults={"activo": True}
            )

    def assign_coverages(self, user, coverage):
        # Se bloquea Zona para mantener consistencia ante cambios administrativos.
        zones = {
            z.pk: z
            for z in Zona.objects.select_for_update()
            .filter(pk__in=[c["zoneId"].pk for c in coverage])
            .order_by("pk")
        }
        for row in coverage:
            if (
                row["zoneId"].pk not in zones
                or zones[row["zoneId"].pk].cliente_id != row["clientId"].pk
            ):
                raise serializers.ValidationError(
                    {"coverages": "La zona cambió de cliente; revisa la cobertura."}
                )
        pairs = {(c["clientId"].pk, c["zoneId"].pk) for c in coverage}
        for current in user.coberturas.filter(activo=True):
            if (current.cliente_id, current.zona_id) not in pairs:
                current.activo = False
                current.save(update_fields=["activo"])
        for client_id, zone_id in sorted(pairs):
            CoberturaUsuario.objects.update_or_create(
                usuario=user,
                cliente_id=client_id,
                zona_id=zone_id,
                defaults={"activo": True},
            )


class ItemPlantillaSerializer(serializers.ModelSerializer):
    title = serializers.CharField(source="descripcion", max_length=200)
    photoRequired = serializers.BooleanField(source="foto_obligatoria")
    active = serializers.BooleanField(source="activo")
    order = serializers.IntegerField(source="orden", min_value=0)
    id = serializers.IntegerField(required=False)

    class Meta:
        model = ItemPlantilla
        fields = ["id", "title", "photoRequired", "active", "order"]


ChecklistTaskSerializer = ItemPlantillaSerializer


RESULTADO_A_FRONTEND = {
    "ok": "conforme",
    "observado": "no_conforme",
    "no_aplica": "no_aplica",
    "": None,
}
RESULTADO_DESDE_FRONTEND = {
    "conforme": "ok",
    "no_conforme": "observado",
    "no_aplica": "no_aplica",
}


def answer_data(answer):
    return {
        "taskId": answer.item_id,
        "result": RESULTADO_A_FRONTEND.get(answer.resultado),
        "observation": answer.observacion,
        "evidenceIds": evidence_ids(answer.checklist.visita, answer.item_id),
    }


class AnswerSerializer(serializers.BaseSerializer):
    def to_representation(self, instance):
        return answer_data(instance)


class PlantillaChecklistSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="nombre", max_length=150)
    active = serializers.BooleanField(source="activa")
    tasks = ItemPlantillaSerializer(source="items", many=True)
    version = serializers.IntegerField(min_value=1)

    class Meta:
        model = PlantillaChecklist
        fields = ["id", "name", "version", "active", "tasks"]

    def validate_tasks(self, tasks):
        if not tasks or not any(t.get("activo", True) for t in tasks):
            raise serializers.ValidationError("Debe haber al menos una tarea activa.")
        ids = [t["id"] for t in tasks if t.get("id", 0) > 0]
        if len(set(ids)) != len(ids):
            raise serializers.ValidationError("Ítems repetidos.")
        if self.instance and set(ids) - set(
            self.instance.items.values_list("id", flat=True)
        ):
            raise serializers.ValidationError("Un ítem pertenece a otra plantilla.")
        if not self.instance and ids:
            raise serializers.ValidationError(
                "Los ítems nuevos deben usar ID temporal negativo o cero."
            )
        return tasks

    def write_items(self, template, tasks):
        kept = []
        for task in tasks:
            pk = task.pop("id", 0)
            if pk > 0:
                item = template.items.get(pk=pk)
                for key, value in task.items():
                    setattr(item, key, value)
                item.save()
            else:
                item = ItemPlantilla.objects.create(plantilla=template, **task)
            kept.append(item.pk)
        template.items.exclude(pk__in=kept).update(activo=False)

    @transaction.atomic
    def create(self, validated_data):
        tasks = validated_data.pop("items")
        template = PlantillaChecklist.objects.create(**validated_data)
        self.write_items(template, tasks)
        return template

    @transaction.atomic
    def update(self, instance, validated_data):
        tasks = validated_data.pop("items", None)
        if tasks is not None:
            validated_data["version"] = max(
                instance.version + 1, validated_data.get("version", instance.version)
            )
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if tasks is not None:
            self.write_items(instance, tasks)
        return instance


class ContratoSerializer(serializers.ModelSerializer):
    clientId = serializers.PrimaryKeyRelatedField(
        source="cliente", queryset=Cliente.objects.all()
    )
    templateId = serializers.PrimaryKeyRelatedField(
        source="plantilla_checklist", queryset=PlantillaChecklist.objects.all()
    )
    startDate = serializers.DateField(source="fecha_inicio")
    endDate = serializers.DateField(source="fecha_fin", allow_null=True)
    monthlyVisits = serializers.IntegerField(
        source="frecuencia_visitas_mensual", min_value=1, max_value=2147483647
    )
    monthlyInterventions = serializers.IntegerField(
        source="minimo_intervenciones_mensual", min_value=2, max_value=2147483647
    )
    radiusMeters = serializers.IntegerField(
        source="radio_validacion_metros", min_value=1, max_value=10000
    )
    active = serializers.BooleanField(source="activo")

    class Meta:
        model = Contrato
        fields = [
            "id",
            "clientId",
            "templateId",
            "startDate",
            "endDate",
            "monthlyVisits",
            "monthlyInterventions",
            "radiusMeters",
            "active",
        ]

    def validate(self, attrs):
        def val(name):
            return attrs.get(name, getattr(self.instance, name, None))

        start, end = val("fecha_inicio"), val("fecha_fin")
        if end and end < start:
            raise serializers.ValidationError(
                {"endDate": "La fecha final no puede ser anterior al inicio."}
            )
        if val("plantilla_checklist") and not val("plantilla_checklist").activa:
            raise serializers.ValidationError(
                {"templateId": "La plantilla está inactiva."}
            )
        if self.instance and self.instance.visita_set.exists():
            for key in ("cliente", "plantilla_checklist"):
                if key in attrs and attrs[key].pk != getattr(
                    self.instance, key + "_id"
                ):
                    raise serializers.ValidationError(
                        {
                            "contract": "Conserva cliente y plantilla del contrato con historial; "
                            "crea un contrato nuevo."
                        }
                    )
        if val("activo") and val("cliente"):
            overlaps = Contrato.objects.filter(
                cliente=val("cliente"), activo=True
            ).filter(Q(fecha_fin__isnull=True) | Q(fecha_fin__gte=start))
            if end:
                overlaps = overlaps.filter(fecha_inicio__lte=end)
            if self.instance:
                overlaps = overlaps.exclude(pk=self.instance.pk)
            if overlaps.exists():
                raise serializers.ValidationError(
                    {
                        "startDate": "Existe otro contrato activo del cliente para esas fechas. "
                        "Ajusta su vigencia antes de crear o activar otro."
                    }
                )
        return attrs


def iso(value):
    return value.isoformat() if value else None


def exception_data(exc):
    return {
        "id": exc.pk,
        "revision": exc.revision,
        "type": exc.tipo,
        "scope": exc.scope,
        "telemetry": exc.telemetria,
        "reason": exc.motivo,
        "failure": exc.fallo,
        "authorId": exc.autor_id,
        "requestedAt": iso(exc.solicitada_en),
        "reviewedAt": iso(exc.revisada_en),
        "reviewerId": exc.revisor_id,
        "approved": None if exc.decision == "pending" else exc.decision == "approved",
        "reviewReason": exc.motivo_decision,
        "evidenceIds": (
            [str(e.client_id) for e in exc.evidencias.all() if e.eliminada_en is None]
            if exc.pk and not exc._state.adding
            else []
        ),
    }


def prepare_visit_audit(visits):
    """Carga identidades autorizadas en lote, incluso las de snapshots históricos."""
    visits = list(visits)
    for visit in visits:
        for attr in ("_audit_exceptions", "_audit_events", "_audit_names"):
            if hasattr(visit, attr):
                delattr(visit, attr)
    prefetch_related_objects(
        visits,
        Prefetch(
            "excepciones",
            queryset=Excepcion.objects.order_by("pk").prefetch_related("evidencias"),
            to_attr="_audit_exceptions",
        ),
        Prefetch(
            "eventos", queryset=Evento.objects.order_by("pk"), to_attr="_audit_events"
        ),
    )
    ids = set()
    for visit in visits:
        ids.update([visit.tecnico_id, visit.excepcion_revisada_por_id])
        for exc in visit._audit_exceptions:
            ids.update([exc.autor_id, exc.revisor_id])
        for event in visit._audit_events:
            snapshot = event.datos.get("exception", {})
            ids.update(
                [
                    event.actor_id,
                    event.datos.get("technicianId"),
                    snapshot.get("authorId"),
                    snapshot.get("reviewerId"),
                ]
            )
    names = {
        u.pk: u.get_full_name().strip() or None
        for u in Usuario.objects.filter(pk__in=ids - {None}).only(
            "id", "first_name", "last_name"
        )
    }
    for visit in visits:
        visit._audit_names = names
    return visits


def visit_list_data(visits, user):
    return [
        visit_data(visit, user=user, audit_prepared=True)
        for visit in prepare_visit_audit(visits)
    ]


def legacy_location(latitude, longitude):
    if latitude is None or longitude is None:
        return None
    return {
        "latitude": float(latitude),
        "longitude": float(longitude),
        "accuracy": None,
        "capturedAt": None,
        "validated": None,
        "legacy": True,
    }


def visit_data(visit, user=None, *, audit_prepared=False):
    from django.utils import timezone

    if not audit_prepared:
        prepare_visit_audit([visit])
    names = visit._audit_names

    def named_exception(snapshot):
        # Copia para presentación: nunca reescribe el JSON de auditoría.
        return {
            **snapshot,
            "authorName": names.get(snapshot.get("authorId")),
            "reviewerName": names.get(snapshot.get("reviewerId")),
        }

    checklist = getattr(visit, "checklist", None)
    tasks = checklist.tareas_snapshot if checklist else []
    answers = [answer_data(a) for a in checklist.respuestas.all()] if checklist else []
    # Evidencia confirmada se recupera incluso si el último guardado del editor falló.
    for task in tasks:
        if not any(a["taskId"] == task["id"] for a in answers):
            answers.append(
                {
                    "taskId": task["id"],
                    "result": None,
                    "observation": "",
                    "evidenceIds": evidence_ids(visit, task["id"]),
                }
            )
    status = {
        "en_curso": "in_progress",
        "completada": "completed",
        "pendiente_validacion": "pending_approval",
        "no_realizada": "cancelled",
        "correccion_requerida": "correction_required",
    }.get(visit.estado, "claimed" if visit.tecnico_id else "available")
    exceptions = [named_exception(exception_data(e)) for e in visit._audit_exceptions]
    location_exception = None
    if visit.excepcion_ubicacion:
        location_exception = {
            "type": "location",
            "reason": visit.justificacion_excepcion,
            "failure": visit.descripcion_fallo_ubicacion,
            "scope": "legacy",
            "telemetry": None,
            "requestedAt": None,
            "reviewedAt": None,
            "reviewerId": visit.excepcion_revisada_por_id,
            "reviewerName": names.get(visit.excepcion_revisada_por_id),
            "approved": visit.excepcion_aprobada,
            "reviewReason": visit.comentario_revision_ubicacion or None,
        }
    time_exception_status = None
    time_exception_reason = visit.justificacion_excepcion_tiempo
    if visit.excepcion_tiempo:
        time_exception_status = (
            "pending"
            if visit.excepcion_tiempo_aprobada is None
            else "approved" if visit.excepcion_tiempo_aprobada else "rejected"
        )
    timed = next(
        (e for e in exceptions if e["type"] == "time_limit" and e["scope"] == "form"),
        None,
    )
    if timed is None:
        timed = next((e for e in exceptions if e["type"] == "time_limit"), None)
    if timed:
        time_exception_status = (
            "pending"
            if timed["approved"] is None
            else "approved" if timed["approved"] else "rejected"
        )
        time_exception_reason = timed["reason"]
    radius = visit.radio_metros

    def duration(end, start):
        return (end - start).total_seconds() if end and start else None

    data = {
        "id": visit.pk,
        "storeId": visit.tienda_id,
        "technicianId": visit.tecnico_id,
        "technicianName": names.get(visit.tecnico_id),
        "ticketId": visit.ticket_origen_id,
        "period": iso(visit.periodo),
        "quota": visit.cuota if visit.origen == "checklist" and visit.periodo else None,
        "quotaCount": (
            Visita.objects.filter(
                tienda_id=visit.tienda_id, origen="checklist", periodo=visit.periodo
            )
            .values("cuota")
            .distinct()
            .count()
            if visit.origen == "checklist" and visit.periodo
            else None
        ),
        "origin": visit.origen,
        "scheduledAt": iso(visit.fecha_programada),
        "status": status,
        "workStatus": VISIT_WORK_STATUS[visit.estado],
        "tasks": tasks,
        "answers": answers,
        "workDescription": visit.descripcion_trabajo
        or (checklist.reporte_general if checklist else ""),
        "evidenceIds": evidence_ids(visit),
        "startLocation": visit.ubicacion_inicio
        or legacy_location(visit.latitud_inicio, visit.longitud_inicio),
        "endLocation": visit.ubicacion_cierre
        or legacy_location(visit.latitud_cierre, visit.longitud_cierre),
        "arrivalEvidenceIds": [
            str(e.client_id)
            for e in visit.archivos.filter(
                proposito="arrival", eliminada_en__isnull=True
            )
        ],
        "startedAt": iso(visit.iniciado_en),
        "physicalEndedAt": iso(visit.terminado_en),
        "notPerformedAt": iso(visit.no_realizada_en),
        "previousAttemptId": visit.intento_anterior_id,
        "formOpenedAt": iso(visit.formulario_abierto_en),
        "claimedAt": iso(visit.reclamada_en),
        "claimExpiresAt": iso(visit.reclamo_vence_en),
        "claimHistory": [
            {
                "id": str(e.pk),
                "at": iso(e.fecha),
                "actorId": e.actor_id,
                "actorName": names.get(e.actor_id),
                "kind": e.tipo,
                "technicianId": e.datos.get("technicianId", e.actor_id),
                "technicianName": names.get(e.datos.get("technicianId", e.actor_id)),
                "claimedAt": e.datos.get("claimedAt"),
                "expiresAt": e.datos.get("expiresAt"),
                "text": e.texto,
            }
            for e in visit._audit_events
            if e.tipo in ("claim", "claim_release")
        ],
        "expiresAt": iso(visit.formulario_vence_en),
        "submittedAt": iso(visit.enviado_en),
        "completedAt": iso(visit.completado_en),
        "revision": visit.borrador_revision,
        "radiusMeters": radius,
        "storeSnapshot": visit.tienda_snapshot or None,
        "serverNow": iso(timezone.now()),
        "timeLimitSeconds": None,
        "timeLimitExceeded": bool(timed or visit.excepcion_tiempo),
        "timeExceptionReason": time_exception_reason,
        "timeExceptionStatus": time_exception_status,
        "exceptions": exceptions,
        "exception": exceptions[-1] if exceptions else location_exception,
        "exceptionHistory": [
            {
                "id": str(e.pk),
                "at": iso(e.fecha),
                "actorId": e.actor_id,
                "actorName": names.get(e.actor_id),
                "kind": e.tipo,
                "exception": named_exception(e.datos["exception"]),
            }
            for e in visit._audit_events
            if "exception" in e.datos
        ],
        "totalSeconds": duration(visit.enviado_en, visit.iniciado_en),
        "executionSeconds": duration(visit.terminado_en, visit.iniciado_en),
        "registrationSeconds": duration(visit.enviado_en, visit.formulario_abierto_en),
        "legacy": not bool(visit.tienda_snapshot)
        or bool(visit.formulario_abierto_en and not visit.terminado_en),
        "active": visit.vigente,
    }
    data["gpsExceptionPending"] = any(
        e["type"] == "location" and e["approved"] is None for e in exceptions
    )
    data["occupiesTechnician"] = bool(
        visit.iniciado_en
        and not visit.enviado_en
        and visit.estado in ("en_curso", "pendiente_validacion")
    )
    data["readOnly"] = visit.estado in (
        "pendiente_validacion",
        "completada",
        "no_realizada",
    )
    data["phase"] = (
        "correction_required"
        if visit.estado == "correccion_requerida"
        else (
            "in_review"
            if visit.estado == "pendiente_validacion" and visit.enviado_en
            else (
                "finished"
                if visit.estado == "completada"
                else (
                    "not_performed"
                    if visit.estado == "no_realizada"
                    else (
                        "results"
                        if visit.formulario_abierto_en
                        else (
                            "physical_finished"
                            if visit.terminado_en
                            else (
                                "physical_work"
                                if visit.iniciado_en
                                else (
                                    "reserved"
                                    if visit.origen == "checklist" and visit.tecnico_id
                                    else (
                                        "scheduled"
                                        if visit.origen == "ticket"
                                        else "available"
                                    )
                                )
                            )
                        )
                    )
                )
            )
        )
    )
    if user is not None and rol_de(user) == "store_supervisor":
        public_fields = (
            "id",
            "storeId",
            "technicianId",
            "ticketId",
            "origin",
            "scheduledAt",
            "status",
            "workStatus",
            "startedAt",
            "completedAt",
            "workDescription",
            "evidenceIds",
            "active",
        )
        return {key: data[key] for key in public_fields}
    return data


def ticket_data(ticket, user=None):
    visit = ticket.visitas_generadas.filter(vigente=True).first()
    data = {
        "id": ticket.pk,
        "storeId": ticket.tienda_id,
        "reporterId": ticket.reportado_por_id,
        "category": ticket.categoria.nombre,
        "categoryId": ticket.categoria_id,
        "priority": ticket.urgencia.nombre,
        "priorityId": ticket.urgencia_id,
        "description": ticket.descripcion,
        "workStatus": TICKET_WORK_STATUS[ticket.estado],
        "status": {
            "abierto": "open",
            "programado": "scheduled",
            "en_proceso": "in_progress",
            "pendiente_validacion": "pending_approval",
            "resuelto": "resolved",
            "cerrado": "closed",
            "correccion_requerida": "correction_required",
        }[ticket.estado],
        "createdAt": iso(ticket.creado_en),
        "technicianId": ticket.tecnico_asignado_id,
        "scheduledAt": iso(ticket.fecha_programada),
        "startedAt": iso(visit.iniciado_en) if visit else None,
        "resolvedAt": iso(ticket.resuelto_en),
        "closedAt": iso(ticket.cerrado_en),
        "resolution": visit.descripcion_trabajo if visit else "",
        "visitId": visit.pk if visit else None,
        "revision": ticket.revision,
        "evidenceIds": [
            str(e.client_id) for e in ticket.archivos.filter(eliminada_en__isnull=True)
        ],
        "technicalEvidenceIds": evidence_ids(visit) if visit else [],
        "history": [
            {
                "id": str(e.pk),
                "at": iso(e.fecha),
                "kind": e.tipo,
                "actorId": e.actor_id,
                "actorName": (
                    (e.actor.get_full_name() or e.actor.username) if e.actor else None
                ),
                "text": e.texto,
                "data": e.datos,
            }
            for e in ticket.eventos.select_related("actor").order_by("pk")
        ],
    }
    if user is not None and rol_de(user) == "store_supervisor":
        labels = {
            "report": "Incidencia reportada",
            "schedule": "Atención programada",
            "complete": "Atención finalizada",
            "review_complete": "Atención finalizada",
            "not_performed": "Atención pendiente de programación",
        }
        data["history"] = [
            {
                "id": str(e.pk),
                "at": iso(e.fecha),
                "actorId": e.actor_id,
                "actorName": (
                    (e.actor.get_full_name() or e.actor.username) if e.actor else None
                ),
                "text": (
                    "Atención reprogramada"
                    if e.tipo == "schedule"
                    and e.datos.get("previous", {}).get("technicianId")
                    else labels[e.tipo]
                ),
            }
            for e in ticket.eventos.select_related("actor")
            .filter(tipo__in=labels)
            .order_by("pk")
        ]
    return data


def evidence_data(evidence):
    return {
        "id": str(evidence.client_id),
        "serverId": evidence.pk,
        "taskId": evidence.item_id,
        "visitId": evidence.visita_id,
        "ticketId": evidence.ticket_id,
        "authorId": evidence.autor_id,
        "name": evidence.nombre,
        "mimeType": evidence.mime_type,
        "size": evidence.tamano,
        "purpose": evidence.proposito,
        "exceptionId": evidence.excepcion_id,
        "capturedAt": iso(evidence.capturada_en),
        "uploadedAt": iso(evidence.subida_en),
        "source": evidence.origen,
    }


class VisitaDetailSerializer(serializers.BaseSerializer):
    def to_representation(self, instance):
        return visit_data(
            instance, user=getattr(self.context.get("request"), "user", None)
        )


VisitaSerializer = VisitaDetailSerializer


class TicketSerializer(serializers.BaseSerializer):
    def to_representation(self, instance):
        return ticket_data(
            instance, user=getattr(self.context.get("request"), "user", None)
        )


class TicketCreateSerializer(serializers.Serializer):
    category = serializers.CharField()
    priority = serializers.CharField()
    description = serializers.CharField()
    evidenceIds = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    storeId = serializers.IntegerField()

    def create(self, validated_data):
        request = self.context["request"]
        categoria = CategoriaProblema.objects.get(nombre=validated_data["category"])
        urgencia = NivelUrgencia.objects.get(nombre=validated_data["priority"])
        tienda = Tienda.objects.get(pk=validated_data["storeId"])
        ticket = Ticket.objects.create(
            tienda=tienda,
            categoria=categoria,
            urgencia=urgencia,
            descripcion=validated_data["description"],
            reportado_por=request.user,
        )
        Evidencia.objects.filter(
            pk__in=validated_data.get("evidenceIds", []),
            checklist__isnull=True,
            ticket__isnull=True,
        ).update(ticket=ticket)
        return ticket


class ReporteVisitaSerializer(VisitaDetailSerializer):
    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["storeName"] = instance.tienda.nombre
        data["technicianName"] = (
            (instance.tecnico.get_full_name() or instance.tecnico.username)
            if instance.tecnico
            else None
        )
        return data
