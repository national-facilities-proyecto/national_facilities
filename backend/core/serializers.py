from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from rest_framework import serializers
from rest_framework.validators import UniqueValidator
from .models import (Cliente, Tienda, Contrato, PlantillaChecklist, ItemPlantilla,
                     Usuario, Rol, AsignacionTienda, Visita, Ticket, Evidencia)
from .permissions import rol_de, ROLES
from .auth_views import identity
from .services import Conflict, evidence_ids
from .workflow import VISIT_WORK_STATUS, TICKET_WORK_STATUS


class ClienteSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="razon_social", max_length=200)
    taxId = serializers.CharField(source="ruc", max_length=20, validators=[UniqueValidator(queryset=Cliente.objects.all())])
    email = serializers.EmailField(source="contacto_email", allow_blank=True)
    class Meta:
        model = Cliente
        fields = ["id", "name", "taxId", "email"]
        extra_kwargs = {"id": {"read_only": True}}


class TiendaSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="nombre", max_length=150)
    address = serializers.CharField(source="direccion", max_length=250)
    latitude = serializers.DecimalField(source="latitud", max_digits=9, decimal_places=6, min_value=-90, max_value=90)
    longitude = serializers.DecimalField(source="longitud", max_digits=9, decimal_places=6, min_value=-180, max_value=180)
    clientId = serializers.PrimaryKeyRelatedField(source="cliente", queryset=Cliente.objects.all())
    contact = serializers.CharField(source="contacto", max_length=200, allow_blank=True)
    active = serializers.BooleanField(source="activo")
    class Meta:
        model = Tienda
        fields = ["id", "name", "address", "latitude", "longitude", "clientId", "contact", "active"]

    def validate(self, attrs):
        if self.instance and "cliente" in attrs and attrs["cliente"].pk != self.instance.cliente_id:
            if self.instance.visitas.exists() or self.instance.tickets.exists():
                raise serializers.ValidationError({"clientId": "No puede cambiarse el cliente de una tienda con historial."})
        return attrs


TiendaAdminSerializer = TiendaSerializer


class RoleField(serializers.Field):
    def to_representation(self, value):
        return ROLES.get(value.nombre.lower())

    def to_internal_value(self, value):
        if value not in ("technician", "store_supervisor", "account_supervisor", "administrator"):
            raise serializers.ValidationError("Rol inválido.")
        names = {"technician": "Tecnico", "store_supervisor": "Supervisor de tienda",
                 "account_supervisor": "Supervisor de cuenta", "administrator": "Administrador"}
        return Rol.objects.get_or_create(nombre=names[value])[0]


class UsuarioSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="first_name", max_length=150)
    role = RoleField(source="rol")
    active = serializers.BooleanField(source="is_active")
    passwordInitialized = serializers.BooleanField(source="password_initialized", read_only=True)
    storeIds = serializers.PrimaryKeyRelatedField(many=True, queryset=Tienda.objects.all(), write_only=True)
    password = serializers.CharField(write_only=True, required=False, min_length=8, trim_whitespace=False)
    class Meta:
        model = Usuario
        fields = ["id", "username", "name", "email", "role", "active", "passwordInitialized", "storeIds", "password"]
        extra_kwargs = {"username": {"required": True}, "email": {"required": True}}

    def to_representation(self, instance):
        return identity(instance)

    def validate(self, attrs):
        user = self.instance or Usuario()
        if not self.instance and not attrs.get("password"):
            raise serializers.ValidationError({"password": "Contraseña inicial obligatoria."})
        if self.instance and self.instance.pk == self.context["request"].user.pk:
            if attrs.get("is_active") is False or ("rol" in attrs and attrs["rol"].nombre != self.instance.rol.nombre):
                raise serializers.ValidationError({"role": "No puedes desactivar tu cuenta o quitarte el rol administrador."})
        ids = attrs.get("storeIds", [a.tienda for a in user.tiendas_asignadas.filter(activo=True).select_related("tienda")] if user.pk else [])
        role = attrs.get("rol", user.rol if user.pk else None)
        if role and ROLES.get(role.nombre.lower()) == "store_supervisor" and len(ids) != 1:
            raise serializers.ValidationError({"storeIds": "Asigna exactamente una tienda al supervisor de tienda."})
        if len({store.pk for store in ids}) != len(ids) and "storeIds" in attrs:
            raise serializers.ValidationError({"storeIds": "No repitas tiendas."})
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
        password = validated_data.pop("password")
        user = Usuario(**validated_data)
        user.set_password(password)
        user.save()
        self.assign(user, stores)
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        stores = validated_data.pop("storeIds", None)
        password = validated_data.pop("password", None)
        old_role = instance.rol_id
        old_active = instance.is_active
        stores_changed = stores is not None and set(s.pk for s in stores) != set(instance.tiendas_asignadas.filter(activo=True).values_list("tienda_id", flat=True))
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
            instance.password_initialized = False
        if password or instance.rol_id != old_role or instance.is_active != old_active or stores_changed:
            instance.auth_version += 1
        instance.save()
        if stores is not None:
            self.assign(instance, stores)
        return instance

    def assign(self, user, stores):
        ids = [s.pk for s in stores]
        user.tiendas_asignadas.exclude(tienda_id__in=ids).update(activo=False)
        for store in stores:
            AsignacionTienda.objects.update_or_create(usuario=user, tienda=store, defaults={"activo": True})


class ItemPlantillaSerializer(serializers.ModelSerializer):
    title = serializers.CharField(source="descripcion", max_length=200)
    photoRequired = serializers.BooleanField(source="foto_obligatoria")
    active = serializers.BooleanField(source="activo")
    order = serializers.IntegerField(source="orden", min_value=0)
    id = serializers.IntegerField(required=False)
    class Meta:
        model = ItemPlantilla
        fields = ["id", "title", "photoRequired", "active", "order"]


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
        if self.instance and set(ids) - set(self.instance.items.values_list("id", flat=True)):
            raise serializers.ValidationError("Un ítem pertenece a otra plantilla.")
        if not self.instance and ids:
            raise serializers.ValidationError("Los ítems nuevos deben usar ID temporal negativo o cero.")
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
            validated_data["version"] = max(instance.version + 1, validated_data.get("version", instance.version))
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if tasks is not None:
            self.write_items(instance, tasks)
        return instance


class ContratoSerializer(serializers.ModelSerializer):
    clientId = serializers.PrimaryKeyRelatedField(source="cliente", queryset=Cliente.objects.all())
    templateId = serializers.PrimaryKeyRelatedField(source="plantilla_checklist", queryset=PlantillaChecklist.objects.all())
    startDate = serializers.DateField(source="fecha_inicio")
    endDate = serializers.DateField(source="fecha_fin", allow_null=True)
    monthlyVisits = serializers.IntegerField(source="frecuencia_visitas_mensual", min_value=1, max_value=2147483647)
    monthlyInterventions = serializers.IntegerField(source="minimo_intervenciones_mensual", min_value=2, max_value=2147483647)
    radiusMeters = serializers.IntegerField(source="radio_validacion_metros", min_value=1, max_value=10000)
    active = serializers.BooleanField(source="activo")
    class Meta:
        model = Contrato
        fields = ["id", "clientId", "templateId", "startDate", "endDate", "monthlyVisits", "monthlyInterventions", "radiusMeters", "active"]

    def validate(self, attrs):
        def val(name):
            return attrs.get(name, getattr(self.instance, name, None))
        start, end = val("fecha_inicio"), val("fecha_fin")
        if end and end < start:
            raise serializers.ValidationError({"endDate": "La fecha final no puede ser anterior al inicio."})
        if val("plantilla_checklist") and not val("plantilla_checklist").activa:
            raise serializers.ValidationError({"templateId": "La plantilla está inactiva."})
        if self.instance and self.instance.visita_set.exists():
            for key in ("cliente", "plantilla_checklist"):
                if key in attrs and attrs[key].pk != getattr(self.instance, key+"_id"):
                    raise serializers.ValidationError({"contract": "Conserva cliente y plantilla del contrato con historial; crea un contrato nuevo."})
        if val("activo") and val("cliente"):
            overlaps = Contrato.objects.filter(cliente=val("cliente"), activo=True).filter(
                Q(fecha_fin__isnull=True) | Q(fecha_fin__gte=start))
            if end:
                overlaps = overlaps.filter(fecha_inicio__lte=end)
            if self.instance:
                overlaps = overlaps.exclude(pk=self.instance.pk)
            if overlaps.exists():
                raise serializers.ValidationError({"startDate": "Existe otro contrato activo del cliente para esas fechas. Ajusta su vigencia antes de crear o activar otro."})
        return attrs


def iso(value):
    return value.isoformat() if value else None


def exception_data(exc):
    return {"id": exc.pk, "revision": exc.revision, "type": exc.tipo, "reason": exc.motivo, "failure": exc.fallo, "authorId": exc.autor_id,
            "requestedAt": iso(exc.solicitada_en), "reviewedAt": iso(exc.revisada_en),
            "reviewerId": exc.revisor_id, "approved": None if exc.decision == "pending" else exc.decision == "approved",
            "reviewReason": exc.motivo_decision}


def visit_data(visit):
    from .claims import CLAIM_DURATION
    from django.utils import timezone
    checklist = getattr(visit, "checklist", None)
    tasks = checklist.tareas_snapshot if checklist else []
    answers = [{"taskId": a.item_id, "result": {"ok": "conforme", "observado": "no_conforme", "no_aplica": "no_aplica", "": None}.get(a.resultado),
                "observation": a.observacion, "evidenceIds": evidence_ids(visit, a.item_id)}
               for a in checklist.respuestas.all()] if checklist else []
    # Evidencia confirmada se recupera incluso si el último guardado del editor falló.
    for task in tasks:
        if not any(a["taskId"] == task["id"] for a in answers):
            answers.append({"taskId": task["id"], "result": None, "observation": "", "evidenceIds": evidence_ids(visit, task["id"])})
    status = {"en_curso": "in_progress", "completada": "completed", "pendiente_validacion": "pending_approval",
              "no_realizada": "cancelled"}.get(visit.estado, "claimed" if visit.tecnico_id else "available")
    exceptions = [exception_data(e) for e in visit.excepciones.order_by("pk")]
    def duration(end, start):
        return (end-start).total_seconds() if end and start else None
    return {"id": visit.pk, "storeId": visit.tienda_id, "technicianId": visit.tecnico_id, "ticketId": visit.ticket_origen_id,
            "period": iso(visit.periodo), "quota": visit.cuota if visit.origen == "checklist" and visit.periodo else None,
            "quotaCount": Visita.objects.filter(tienda_id=visit.tienda_id, origen="checklist", periodo=visit.periodo).count() if visit.origen == "checklist" and visit.periodo else None,
            "origin": visit.origen, "scheduledAt": iso(visit.fecha_programada), "status": status,
            "workStatus": VISIT_WORK_STATUS[visit.estado], "tasks": tasks,
            "answers": answers, "workDescription": visit.descripcion_trabajo, "evidenceIds": evidence_ids(visit),
            "startLocation": visit.ubicacion_inicio, "endLocation": visit.ubicacion_cierre,
            "startedAt": iso(visit.iniciado_en), "formOpenedAt": iso(visit.formulario_abierto_en),
            "claimedAt": iso(visit.reclamada_en), "claimExpiresAt": iso(visit.reclamo_vence_en),
            "claimHistory": [{"id": str(e.pk), "at": iso(e.fecha), "actorId": e.actor_id,
                "kind": e.tipo, "technicianId": e.datos.get("technicianId", e.actor_id),
                "claimedAt": e.datos.get("claimedAt", iso(e.fecha)),
                "expiresAt": e.datos.get("expiresAt", iso(e.fecha + CLAIM_DURATION)), "text": e.texto}
                for e in visit.eventos.filter(tipo__in=["claim", "claim_release"]).order_by("pk")],
            "expiresAt": iso(visit.formulario_vence_en), "submittedAt": iso(visit.enviado_en), "completedAt": iso(visit.completado_en),
            "revision": visit.borrador_revision, "radiusMeters": visit.radio_metros, "storeSnapshot": visit.tienda_snapshot or None,
            "serverNow": iso(timezone.now()), "timeLimitSeconds": 300 if visit.formulario_abierto_en else None,
            "timeLimitExceeded": bool(visit.formulario_vence_en and timezone.now() >= visit.formulario_vence_en and not visit.completado_en),
            "exceptions": exceptions, "exception": exceptions[-1] if exceptions else None,
            "exceptionHistory": [{"id": str(e.pk), "at": iso(e.fecha), "actorId": e.actor_id,
                "kind": e.tipo, "exception": e.datos["exception"]}
                for e in visit.eventos.order_by("pk") if "exception" in e.datos],
            "totalSeconds": duration(visit.enviado_en, visit.iniciado_en),
            "executionSeconds": duration(visit.formulario_abierto_en, visit.iniciado_en),
            "registrationSeconds": duration(visit.enviado_en, visit.formulario_abierto_en),
            "legacy": not bool(visit.tienda_snapshot), "active": visit.vigente}


def ticket_data(ticket):
    visit = ticket.visitas_generadas.filter(vigente=True).first()
    return {"id": ticket.pk, "storeId": ticket.tienda_id, "reporterId": ticket.reportado_por_id,
            "category": ticket.categoria.nombre, "categoryId": ticket.categoria_id,
            "priority": ticket.urgencia.nombre, "priorityId": ticket.urgencia_id,
            "description": ticket.descripcion,
            "workStatus": TICKET_WORK_STATUS[ticket.estado],
            "status": {"abierto": "open", "programado": "scheduled", "en_proceso": "in_progress", "pendiente_validacion": "pending_approval", "resuelto": "resolved", "cerrado": "closed"}[ticket.estado],
            "createdAt": iso(ticket.creado_en), "technicianId": ticket.tecnico_asignado_id,
            "scheduledAt": iso(ticket.fecha_programada), "resolvedAt": iso(ticket.resuelto_en), "closedAt": iso(ticket.cerrado_en),
            "resolution": visit.descripcion_trabajo if visit else "", "visitId": visit.pk if visit else None,
            "revision": ticket.revision,
            "evidenceIds": [str(e.client_id) for e in ticket.archivos.filter(eliminada_en__isnull=True)],
            "technicalEvidenceIds": evidence_ids(visit) if visit else [],
            "history": [{"id": str(e.pk), "at": iso(e.fecha), "actorId": e.actor_id, "text": e.texto, "data": e.datos} for e in ticket.eventos.order_by("pk")]}


def evidence_data(evidence):
    return {"id": str(evidence.client_id), "serverId": evidence.pk, "taskId": evidence.item_id,
            "visitId": evidence.visita_id, "ticketId": evidence.ticket_id, "authorId": evidence.autor_id,
            "name": evidence.nombre, "mimeType": evidence.mime_type, "size": evidence.tamano,
            "capturedAt": iso(evidence.capturada_en), "uploadedAt": iso(evidence.subida_en), "source": evidence.origen}
