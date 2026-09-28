from rest_framework import serializers

from .models import (
    Evidencia, Tienda, Visita, Cliente, Contrato,
    PlantillaChecklist, ItemPlantilla, Usuario,
    Checklist, RespuestaItem, Ticket, CategoriaProblema, NivelUrgencia,
)

from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

ROL_A_SLUG = {
    "Tecnico": "technician",
    "SupervisorTienda": "store_supervisor",
    "SupervisorCuenta": "account_supervisor",
    "Administrador": "administrator",
}

def construir_datos_usuario(usuario):
    rol_slug = ROL_A_SLUG.get(usuario.rol.nombre) if usuario.rol else None
    return {
        "id": usuario.id,
        "name": usuario.get_full_name() or usuario.username,
        "email": usuario.email,
        "role": rol_slug,
        "storeIds": list(
            usuario.tiendas_asignadas.filter(activo=True).values_list("tienda_id", flat=True)
        ),
        "active": usuario.is_active,
        "passwordInitialized": usuario.password_inicializada,
    }


class NfTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = construir_datos_usuario(self.user)
        return data

class TiendaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tienda
        fields = ["id", "nombre", "direccion", "latitud", "longitud", "cliente"]


class EvidenciaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Evidencia
        fields = ["id", "checklist", "ticket", "item", "foto", "descripcion", "subida_en"]
        read_only_fields = ["subida_en"]

    def validate_checklist(self, checklist):
        usuario = self.context["request"].user
        if checklist and checklist.visita.tecnico != usuario:
            raise serializers.ValidationError("No puedes subir evidencia a un checklist que no es tuyo.")
        return checklist


class VisitaSerializer(serializers.ModelSerializer):
    tienda = TiendaSerializer(read_only=True)

    class Meta:
        model = Visita
        fields = [
            "id", "tienda", "origen", "tecnico", "ticket_origen",
            "fecha_programada", "estado", "justificacion",
        ]
        read_only_fields = fields


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = ["id", "razon_social", "ruc", "contacto_nombre", "contacto_email"]


class TiendaAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tienda
        fields = ["id", "cliente", "nombre", "direccion", "latitud", "longitud"]


class ContratoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contrato
        fields = [
            "id", "cliente", "plantilla_checklist", "frecuencia_visitas_mensual",
            "minimo_intervenciones_mensual", "radio_validacion_metros",
            "fecha_inicio", "fecha_fin", "activo",
        ]


class PlantillaChecklistSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlantillaChecklist
        fields = ["id", "nombre", "version", "activa"]


class ItemPlantillaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemPlantilla
        fields = ["id", "plantilla", "descripcion", "orden", "activo"]


class UsuarioSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Usuario
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "telefono", "rol", "is_active", "password_inicializada", "password",
        ]

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError({"password": "La contraseña es obligatoria al crear un usuario."})
        usuario = Usuario(**validated_data)
        usuario.set_password(password)
        usuario.save()
        return usuario

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        if password:
            instance.set_password(password)
        instance.save()
        return instance

RESULTADO_A_FRONTEND = {"ok": "conforme", "observado": "no_conforme", "no_aplica": "no_conforme"}
RESULTADO_DESDE_FRONTEND = {"conforme": "ok", "no_conforme": "observado"}


class ChecklistTaskSerializer(serializers.ModelSerializer):
    title = serializers.CharField(source="descripcion")
    photoRequired = serializers.BooleanField(source="foto_requerida")
    active = serializers.BooleanField(source="activo")
    order = serializers.IntegerField(source="orden")

    class Meta:
        model = ItemPlantilla
        fields = ["id", "title", "photoRequired", "active", "order"]


class AnswerSerializer(serializers.ModelSerializer):
    taskId = serializers.IntegerField(source="item_id")
    result = serializers.SerializerMethodField()
    observation = serializers.CharField(source="observacion")
    evidenceIds = serializers.SerializerMethodField()

    class Meta:
        model = RespuestaItem
        fields = ["taskId", "result", "observation", "evidenceIds"]

    def get_result(self, obj):
        return RESULTADO_A_FRONTEND.get(obj.resultado)

    def get_evidenceIds(self, obj):
        return [str(e.id) for e in Evidencia.objects.filter(checklist=obj.checklist, item=obj.item)]


class VisitaDetailSerializer(serializers.ModelSerializer):
    storeId = serializers.IntegerField(source="tienda_id")
    technicianId = serializers.IntegerField(source="tecnico_id", allow_null=True)
    ticketId = serializers.IntegerField(source="ticket_origen_id", allow_null=True)
    origin = serializers.CharField(source="origen")
    scheduledAt = serializers.DateTimeField(source="fecha_programada")
    status = serializers.SerializerMethodField()
    tasks = serializers.SerializerMethodField()
    answers = serializers.SerializerMethodField()
    workDescription = serializers.SerializerMethodField()
    evidenceIds = serializers.SerializerMethodField()
    startLocation = serializers.SerializerMethodField()
    endLocation = serializers.SerializerMethodField()
    startedAt = serializers.DateTimeField(source="iniciada_en", allow_null=True)
    completedAt = serializers.DateTimeField(source="completada_en", allow_null=True)
    expiresAt = serializers.SerializerMethodField()
    timeLimitSeconds = serializers.SerializerMethodField()
    timeLimitExceeded = serializers.BooleanField(source="excepcion_tiempo")
    timeExceptionReason = serializers.CharField(source="justificacion_excepcion_tiempo")
    timeExceptionStatus = serializers.SerializerMethodField()
    exception = serializers.SerializerMethodField()
    radiusMeters = serializers.SerializerMethodField()

    class Meta:
        model = Visita
        fields = [
            "id", "storeId", "technicianId", "ticketId", "origin", "scheduledAt", "status",
            "tasks", "answers", "workDescription", "evidenceIds",
            "startLocation", "endLocation", "startedAt", "completedAt", "expiresAt",
            "timeLimitSeconds", "timeLimitExceeded", "timeExceptionReason", "timeExceptionStatus",
            "exception", "radiusMeters",
        ]

    def get_status(self, obj):
        if obj.tecnico_id is None:
            return "available"
        if obj.estado == "completada":
            return "completed"
        if obj.estado == "pendiente_validacion":
            return "pending_approval"
        if obj.iniciada_en is None:
            return "claimed"
        return "in_progress"

    def get_tasks(self, obj):
        checklist = getattr(obj, "checklist", None)
        if not checklist:
            return []
        items = checklist.plantilla.items.filter(activo=True)
        return ChecklistTaskSerializer(items, many=True).data

    def get_answers(self, obj):
        checklist = getattr(obj, "checklist", None)
        if not checklist:
            return []
        return AnswerSerializer(checklist.respuestas.all(), many=True).data

    def get_workDescription(self, obj):
        checklist = getattr(obj, "checklist", None)
        return checklist.reporte_general if checklist else ""

    def get_evidenceIds(self, obj):
        ids = []
        checklist = getattr(obj, "checklist", None)
        if checklist:
            ids += [str(e.id) for e in checklist.evidencias.all()]
        if obj.ticket_origen:
            ids += [str(e.id) for e in obj.ticket_origen.evidencias.all()]
        return ids

    def get_startLocation(self, obj):
        if obj.latitud_inicio is None:
            return None
        return {
            "latitude": float(obj.latitud_inicio),
            "longitude": float(obj.longitud_inicio),
            "accuracy": 0,
            "capturedAt": obj.iniciada_en.timestamp() * 1000 if obj.iniciada_en else None,
        }

    def get_endLocation(self, obj):
        if obj.latitud_cierre is None:
            return None
        return {
            "latitude": float(obj.latitud_cierre),
            "longitude": float(obj.longitud_cierre),
            "accuracy": 0,
            "capturedAt": obj.completada_en.timestamp() * 1000 if obj.completada_en else None,
        }

    def get_expiresAt(self, obj):
        if obj.iniciada_en is None:
            return None
        from datetime import timedelta
        return obj.iniciada_en + timedelta(seconds=300)

    def get_timeLimitSeconds(self, obj):
        return 300

    def get_timeExceptionStatus(self, obj):
        if not obj.excepcion_tiempo:
            return None
        if obj.excepcion_tiempo_aprobada is None:
            return "pending"
        return "approved" if obj.excepcion_tiempo_aprobada else "rejected"

    def get_exception(self, obj):
        if not obj.excepcion_ubicacion:
            return None
        return {
            "type": "location",
            "reason": obj.justificacion_excepcion,
            "failure": obj.descripcion_fallo_ubicacion,
            "requestedAt": obj.completada_en.isoformat() if obj.completada_en else None,
            "reviewedAt": None,
            "reviewerId": obj.excepcion_revisada_por_id,
            "approved": obj.excepcion_aprobada,
            "reviewReason": obj.comentario_revision_ubicacion or None,
        }

    def get_radiusMeters(self, obj):
        contrato = obj.tienda.cliente.contratos.filter(activo=True).order_by("-fecha_inicio").first()
        return contrato.radio_validacion_metros if contrato else 100


class TicketSerializer(serializers.ModelSerializer):
    storeId = serializers.IntegerField(source="tienda_id")
    reporterId = serializers.IntegerField(source="reportado_por_id")
    category = serializers.CharField(source="categoria.nombre", read_only=True)
    priority = serializers.CharField(source="urgencia.nombre", read_only=True)
    description = serializers.CharField(source="descripcion")
    createdAt = serializers.DateTimeField(source="creado_en")
    technicianId = serializers.IntegerField(source="tecnico_asignado_id", allow_null=True)
    scheduledAt = serializers.DateTimeField(source="fecha_programada", allow_null=True)
    resolvedAt = serializers.DateTimeField(source="resuelto_en", allow_null=True)
    evidenceIds = serializers.SerializerMethodField()

    status = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            "id", "storeId", "reporterId", "category", "priority", "description",
            "status", "createdAt", "technicianId", "scheduledAt", "resolvedAt", "evidenceIds",
        ]

    def get_status(self, obj):
        return {
            "abierto": "open", "programado": "scheduled", "en_proceso": "in_progress",
            "resuelto": "resolved", "cerrado": "closed",
        }.get(obj.estado)
    
    def get_evidenceIds(self, obj):
        return [str(e.id) for e in obj.evidencias.all()]


class TicketCreateSerializer(serializers.Serializer):
    category = serializers.CharField()
    priority = serializers.CharField()
    description = serializers.CharField()
    evidenceIds = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    storeId = serializers.IntegerField()

    def create(self, validated_data):
        request = self.context["request"]
        categoria = CategoriaProblema.objects.get(nombre=validated_data["category"])
        urgencia = NivelUrgencia.objects.get(nombre=validated_data["priority"])
        tienda = Tienda.objects.get(pk=validated_data["storeId"])
        ticket = Ticket.objects.create(
            tienda=tienda, categoria=categoria, urgencia=urgencia,
            descripcion=validated_data["description"], reportado_por=request.user,
        )
        Evidencia.objects.filter(
            pk__in=validated_data.get("evidenceIds", []), checklist__isnull=True, ticket__isnull=True
        ).update(ticket=ticket)
        return ticket

class ReporteVisitaSerializer(VisitaDetailSerializer):
    storeName = serializers.CharField(source="tienda.nombre", read_only=True)
    technicianName = serializers.SerializerMethodField()

    class Meta(VisitaDetailSerializer.Meta):
        fields = VisitaDetailSerializer.Meta.fields + ["storeName", "technicianName"]

    def get_technicianName(self, obj):
        if not obj.tecnico:
            return None
        return obj.tecnico.get_full_name() or obj.tecnico.username