from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q, F
from django.core.validators import MinValueValidator
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateRangeField, RangeOperators
from datetime import timedelta
import uuid


class Rol(models.Model):
    nombre = models.CharField(max_length=50, unique=True)
    descripcion = models.TextField(blank=True)

    def __str__(self):
        return self.nombre


class Usuario(AbstractUser):
    rol = models.ForeignKey(Rol, on_delete=models.PROTECT, null=True, blank=True)
    telefono = models.CharField(max_length=20, blank=True)

    password_initialized = models.BooleanField(default=False)
    auth_version = models.PositiveIntegerField(default=1)

    def __str__(self):
        return self.username


class Cliente(models.Model):
    razon_social = models.CharField(max_length=200)
    ruc = models.CharField(max_length=20, unique=True)
    contacto_nombre = models.CharField(max_length=150, blank=True)
    contacto_email = models.EmailField(blank=True)

    def __str__(self):
        return self.razon_social


class Zona(models.Model):
    cliente = models.ForeignKey(Cliente, on_delete=models.PROTECT, related_name="zonas")
    nombre = models.CharField(max_length=150)
    activo = models.BooleanField(default=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["cliente", "nombre"], name="zona_cliente_nombre_unico"
            ),
        ]
        indexes = [
            models.Index(fields=["cliente", "activo"], name="zona_cliente_activo_idx")
        ]

    def clean(self):
        super().clean()
        if self.pk and self.cliente_id:
            previous = Zona.objects.using(self._state.db).filter(pk=self.pk)
            if previous.exclude(cliente_id=self.cliente_id).exists():
                if (
                    self.tiendas.exclude(cliente_id=self.cliente_id).exists()
                    or self.coberturas.exclude(cliente_id=self.cliente_id).exists()
                ):
                    raise ValidationError(
                        {
                            "cliente": "No puede cambiarse el cliente de una zona con tiendas o coberturas de otro cliente."
                        }
                    )

    def save(self, *args, **kwargs):
        # También protege el cambio de cliente al guardar desde el ORM normal.
        # QuerySet.update/bulk_* no ejecutan esta validación de dominio.
        self.clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.cliente.razon_social} / {self.nombre}"


def _validar_cliente_zona(cliente_id, zona_id, using=None):
    if cliente_id is None or zona_id is None:
        return
    # Consulta el cliente persistido, no una relación cacheada potencialmente antigua.
    # La existencia de zona/cliente queda además protegida por sus FK en la DB.
    zona_cliente_id = (
        Zona.objects.using(using)
        .filter(pk=zona_id)
        .values_list("cliente_id", flat=True)
        .first()
    )
    if zona_cliente_id is not None and zona_cliente_id != cliente_id:
        raise ValidationError({"zona": "La zona debe pertenecer al mismo cliente."})


def _validar_cliente_zona_update_fields(instance, update_fields, using=None):
    if not instance.pk or not update_fields:
        return
    fields = set(update_fields)
    changes_client = bool(fields & {"cliente", "cliente_id"})
    changes_zone = bool(fields & {"zona", "zona_id"})
    if changes_client == changes_zone:
        return
    previous = (
        type(instance)
        .objects.using(using)
        .filter(pk=instance.pk)
        .values("cliente_id", "zona_id")
        .first()
    )
    if previous:
        # Los atributos omitidos en update_fields conservarán su valor en la DB.
        _validar_cliente_zona(
            instance.cliente_id if changes_client else previous["cliente_id"],
            instance.zona_id if changes_zone else previous["zona_id"],
            using,
        )


class Tienda(models.Model):
    # La tienda es una entidad operativa independiente de quién tenga acceso a ella.
    # La relación con usuarios (supervisor de tienda, supervisor de cuenta) se
    # resuelve mediante AsignacionTienda, no con una FK directa aquí.
    cliente = models.ForeignKey(
        Cliente, on_delete=models.PROTECT, related_name="tiendas"
    )
    # Nullable durante la transición: las tiendas existentes requieren asignación explícita.
    zona = models.ForeignKey(
        Zona, on_delete=models.PROTECT, related_name="tiendas", null=True, blank=True
    )
    nombre = models.CharField(max_length=150)
    direccion = models.CharField(max_length=250)
    latitud = models.DecimalField(max_digits=9, decimal_places=6)
    longitud = models.DecimalField(max_digits=9, decimal_places=6)
    contacto = models.CharField(max_length=200, blank=True)
    activo = models.BooleanField(default=True)

    def clean(self):
        super().clean()
        _validar_cliente_zona(self.cliente_id, self.zona_id, self._state.db)

    def save(self, *args, **kwargs):
        self.clean()
        _validar_cliente_zona_update_fields(
            self, kwargs.get("update_fields"), kwargs.get("using") or self._state.db
        )
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nombre} ({self.cliente.razon_social})"


class AsignacionTienda(models.Model):
    # Sigue siendo el mecanismo vigente en Fase 1A. Tras la migración funcional,
    # quedará para Supervisor de tienda y el histórico de transición.
    """
    Relación entre un usuario y una tienda.

    Resuelve dos casos con la misma tabla:
      - Supervisor de tienda: una asignación, una tienda.
      - Supervisor de cuenta: varias asignaciones, una por cada tienda
        de su zona o cartera.

    Al desvincularse una persona, se elimina o desactiva su asignación;
    la tienda y su historial de visitas y tickets no se ven afectados.
    """
    usuario = models.ForeignKey(
        Usuario, on_delete=models.CASCADE, related_name="tiendas_asignadas"
    )
    tienda = models.ForeignKey(
        Tienda, on_delete=models.CASCADE, related_name="usuarios_asignados"
    )
    activo = models.BooleanField(default=True)
    asignado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("usuario", "tienda")

    def __str__(self):
        return f"{self.usuario} → {self.tienda}"


class CoberturaUsuario(models.Model):
    # Base V2 para Técnico y Supervisor NF; todavía no participa en permisos.
    usuario = models.ForeignKey(
        Usuario, on_delete=models.PROTECT, related_name="coberturas"
    )
    cliente = models.ForeignKey(
        Cliente, on_delete=models.PROTECT, related_name="coberturas_usuario"
    )
    zona = models.ForeignKey(Zona, on_delete=models.PROTECT, related_name="coberturas")
    activo = models.BooleanField(default=True)
    asignado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["usuario", "cliente", "zona"],
                name="cobertura_usuario_cliente_zona_unica",
            ),
        ]
        indexes = [
            models.Index(
                fields=["usuario", "activo"], name="cobertura_usuario_activo_idx"
            )
        ]

    def clean(self):
        super().clean()
        _validar_cliente_zona(self.cliente_id, self.zona_id, self._state.db)

    def save(self, *args, **kwargs):
        self.clean()
        _validar_cliente_zona_update_fields(
            self, kwargs.get("update_fields"), kwargs.get("using") or self._state.db
        )
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.usuario} → {self.cliente.razon_social} / {self.zona.nombre}"


class PlantillaChecklist(models.Model):
    nombre = models.CharField(max_length=150)
    version = models.PositiveIntegerField(default=1)
    activa = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.nombre} v{self.version}"


class ItemPlantilla(models.Model):
    plantilla = models.ForeignKey(
        PlantillaChecklist, on_delete=models.CASCADE, related_name="items"
    )
    descripcion = models.CharField(max_length=200)
    orden = models.PositiveIntegerField(default=0)
    activo = models.BooleanField(default=True)  # soft-deactivate, nunca se borra

    foto_obligatoria = models.BooleanField(default=True)

    class Meta:
        ordering = ["orden"]

    def __str__(self):
        return self.descripcion


class Contrato(models.Model):
    cliente = models.ForeignKey(
        Cliente, on_delete=models.PROTECT, related_name="contratos"
    )
    plantilla_checklist = models.ForeignKey(
        PlantillaChecklist, on_delete=models.PROTECT
    )
    frecuencia_visitas_mensual = models.PositiveIntegerField(default=1)
    # Mínimo mensual de atenciones de tickets por cada tienda, separado del checklist.
    # El sistema NO genera prontos automáticamente
    # al llegar a este número: solo alimenta el indicador de riesgo de
    # incumplimiento que ve el supervisor de cuenta (HU-20/HU-21).
    minimo_intervenciones_mensual = models.PositiveIntegerField(
        default=2, validators=[MinValueValidator(2)]
    )
    # Radio de validación de proximidad geográfica, en metros. 100 por
    # defecto: cubre el margen de error típico del GPS de un celular
    # (5-20 m en exteriores, mayor dentro de un local techado), sin dejar
    # de distinguir la presencia real en la tienda de la ejecución remota.
    radio_validacion_metros = models.PositiveIntegerField(default=100)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField(null=True, blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(minimo_intervenciones_mensual__gte=2),
                name="contrato_minimo_dos_por_tienda",
            ),
            models.CheckConstraint(
                condition=Q(fecha_fin__isnull=True)
                | Q(fecha_fin__gte=F("fecha_inicio")),
                name="contrato_fechas_ordenadas",
            ),
            ExclusionConstraint(
                name="contrato_activo_sin_superposicion",
                condition=Q(activo=True),
                expressions=[
                    ("cliente", RangeOperators.EQUAL),
                    (
                        models.Func(
                            "fecha_inicio",
                            "fecha_fin",
                            models.Value("[]"),
                            function="DATERANGE",
                            output_field=DateRangeField(),
                        ),
                        RangeOperators.OVERLAPS,
                    ),
                ],
            ),
        ]

    def __str__(self):
        return f"Contrato {self.cliente.razon_social} #{self.pk}"


class Visita(models.Model):
    ESTADO_CHOICES = [
        ("programada", "Pendiente"),
        ("en_curso", "En proceso"),
        ("completada", "Finalizado"),
        ("pendiente_validacion", "En revisión"),
        ("correccion_requerida", "Corrección requerida"),
        ("no_realizada", "No realizada"),
    ]
    ORIGEN_CHOICES = [
        ("checklist", "Checklist mensual (bolsa compartida)"),
        ("ticket", "Generada desde un ticket"),
    ]

    tienda = models.ForeignKey(Tienda, on_delete=models.PROTECT, related_name="visitas")
    origen = models.CharField(
        max_length=20, choices=ORIGEN_CHOICES, default="checklist"
    )
    tecnico = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="visitas_asignadas",
    )
    ticket_origen = models.ForeignKey(
        "Ticket",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="visitas_generadas",
    )
    fecha_programada = models.DateTimeField()
    estado = models.CharField(
        max_length=20, choices=ESTADO_CHOICES, default="programada"
    )
    justificacion = models.TextField(blank=True)
    contrato = models.ForeignKey(
        Contrato, on_delete=models.PROTECT, null=True, blank=True
    )
    periodo = models.DateField(null=True, blank=True)
    cuota = models.PositiveIntegerField(default=1)
    vigente = models.BooleanField(default=True)
    radio_metros = models.PositiveIntegerField(null=True, blank=True)
    tienda_snapshot = models.JSONField(default=dict)
    minimo_mensual_snapshot = models.PositiveIntegerField(null=True, blank=True)
    reclamada_en = models.DateTimeField(null=True, blank=True)
    reclamo_vence_en = models.DateTimeField(null=True, blank=True)
    iniciado_en = models.DateTimeField(null=True, blank=True)
    terminado_en = models.DateTimeField(null=True, blank=True)
    no_realizada_en = models.DateTimeField(null=True, blank=True)
    intento_anterior = models.OneToOneField(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="siguiente_intento",
    )
    formulario_abierto_en = models.DateTimeField(null=True, blank=True)
    formulario_vence_en = models.DateTimeField(null=True, blank=True)
    enviado_en = models.DateTimeField(null=True, blank=True)
    completado_en = models.DateTimeField(null=True, blank=True)
    ubicacion_inicio = models.JSONField(null=True, blank=True)
    ubicacion_cierre = models.JSONField(null=True, blank=True)
    descripcion_trabajo = models.TextField(blank=True)
    borrador_revision = models.PositiveIntegerField(default=0)

    # Coordenadas y distancia registradas al cierre. La distancia se
    # guarda siempre (no solo el resultado sí/no de la validación) para
    # dejar evidencia verificable ante el cliente y poder recalibrar el
    # umbral con datos reales de operación.
    latitud_cierre = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    longitud_cierre = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    distancia_medida_metros = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    proximidad_validada = models.BooleanField(default=False)

    latitud_inicio = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    longitud_inicio = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    distancia_inicio_metros = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    proximidad_inicio_validada = models.BooleanField(default=False)

    excepcion_tiempo = models.BooleanField(default=False)
    justificacion_excepcion_tiempo = models.TextField(blank=True)
    excepcion_tiempo_aprobada = models.BooleanField(null=True, blank=True)
    excepcion_tiempo_revisada_por = models.ForeignKey(
        Usuario,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="excepciones_tiempo_revisadas",
    )
    comentario_revision_tiempo = models.TextField(blank=True)

    # Campos históricos conservados. V2 registra cada etapa y decisión en
    # Excepcion; solicitar una excepción nunca equivale a enviar a revisión.
    excepcion_ubicacion = models.BooleanField(default=False)
    justificacion_excepcion = models.TextField(blank=True)
    descripcion_fallo_ubicacion = models.TextField(blank=True)
    excepcion_revisada_por = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="excepciones_revisadas",
    )
    comentario_revision_ubicacion = models.TextField(blank=True)
    excepcion_aprobada = models.BooleanField(null=True, blank=True)  # None = pendiente

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tienda", "periodo", "cuota"],
                condition=Q(origen="checklist", periodo__isnull=False, vigente=True),
                name="visita_cuota_mensual_unica",
            ),
            models.UniqueConstraint(
                fields=["tecnico"],
                condition=Q(
                    tecnico__isnull=False,
                    iniciado_en__isnull=False,
                    enviado_en__isnull=True,
                    estado__in=["en_curso", "pendiente_validacion"],
                ),
                name="tecnico_una_ejecucion_activa",
            ),
            models.CheckConstraint(
                condition=Q(terminado_en__isnull=True)
                | Q(iniciado_en__isnull=False, terminado_en__gte=F("iniciado_en")),
                name="visita_fin_fisico_despues_inicio",
            ),
            models.CheckConstraint(
                condition=Q(terminado_en__isnull=True)
                | Q(formulario_abierto_en__isnull=True)
                | Q(formulario_abierto_en__gte=F("terminado_en")),
                name="visita_formulario_despues_fin",
            ),
            models.UniqueConstraint(
                fields=["ticket_origen"],
                condition=Q(origen="ticket", vigente=True, ticket_origen__isnull=False),
                name="ticket_una_visita_vigente",
            ),
            models.CheckConstraint(
                condition=Q(reclamada_en__isnull=True, reclamo_vence_en__isnull=True)
                | Q(
                    origen="checklist",
                    reclamada_en__isnull=False,
                    reclamo_vence_en__isnull=False,
                    reclamo_vence_en=F("reclamada_en") + timedelta(hours=2),
                ),
                name="visita_reclamo_dos_horas",
            ),
            models.CheckConstraint(
                condition=Q(
                    formulario_abierto_en__isnull=True, formulario_vence_en__isnull=True
                )
                | Q(
                    iniciado_en__isnull=False,
                    formulario_abierto_en__isnull=False,
                    formulario_abierto_en__gte=F("iniciado_en"),
                )
                & (
                    Q(formulario_vence_en__isnull=True)
                    | Q(formulario_vence_en__gte=F("formulario_abierto_en"))
                ),
                name="visita_formulario_cronologia",
            ),
            models.CheckConstraint(
                condition=Q(enviado_en__isnull=True)
                | Q(
                    formulario_abierto_en__isnull=False,
                    enviado_en__gte=F("formulario_abierto_en"),
                ),
                name="visita_envio_despues_apertura",
            ),
            models.CheckConstraint(
                condition=Q(completado_en__isnull=True)
                | Q(enviado_en__isnull=False, completado_en__gte=F("enviado_en")),
                name="visita_finalizacion_despues_envio",
            ),
        ]

    def __str__(self):
        return f"Visita a {self.tienda.nombre} - {self.fecha_programada:%Y-%m-%d}"


class Checklist(models.Model):
    visita = models.OneToOneField(
        Visita, on_delete=models.CASCADE, related_name="checklist"
    )
    plantilla = models.ForeignKey(PlantillaChecklist, on_delete=models.PROTECT)
    reporte_general = models.TextField(blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    plantilla_version = models.PositiveIntegerField(null=True, blank=True)
    tareas_snapshot = models.JSONField(default=list)

    def __str__(self):
        return f"Checklist visita #{self.visita_id}"


class RespuestaItem(models.Model):
    RESULTADO_CHOICES = [
        ("ok", "Conforme"),
        ("observado", "No conforme"),
        ("no_aplica", "No aplica"),
    ]

    checklist = models.ForeignKey(
        Checklist, on_delete=models.CASCADE, related_name="respuestas"
    )
    item = models.ForeignKey(ItemPlantilla, on_delete=models.PROTECT)
    resultado = models.CharField(max_length=20, choices=RESULTADO_CHOICES)
    observacion = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["checklist", "item"], name="respuesta_checklist_item_unica"
            )
        ]

    def __str__(self):
        return f"{self.item.descripcion}: {self.resultado}"


class Evidencia(models.Model):
    # La fuente es metadato declarado; no demuestra autenticidad de captura.
    checklist = models.ForeignKey(
        Checklist,
        on_delete=models.PROTECT,
        related_name="evidencias",
        null=True,
        blank=True,
    )
    visita = models.ForeignKey(
        Visita, on_delete=models.PROTECT, related_name="archivos", null=True, blank=True
    )
    proposito = models.CharField(
        max_length=10,
        choices=[("result", "Resultado"), ("arrival", "Llegada")],
        default="result",
    )
    excepcion = models.ForeignKey(
        "Excepcion",
        on_delete=models.PROTECT,
        related_name="evidencias",
        null=True,
        blank=True,
    )
    ticket = models.ForeignKey(
        "Ticket",
        on_delete=models.PROTECT,
        related_name="archivos",
        null=True,
        blank=True,
    )
    item = models.ForeignKey(
        ItemPlantilla,
        on_delete=models.PROTECT,
        related_name="evidencias",
        null=True,
        blank=True,
    )
    autor = models.ForeignKey(Usuario, on_delete=models.PROTECT, null=True, blank=True)
    client_id = models.UUIDField(default=uuid.uuid4, unique=True)
    nombre = models.CharField(max_length=200, blank=True)
    mime_type = models.CharField(max_length=50, blank=True)
    tamano = models.PositiveIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True)
    origen = models.CharField(
        max_length=10,
        choices=[("camera", "Cámara"), ("gallery", "Galería"), ("upload", "Archivo")],
        default="upload",
    )
    capturada_en = models.DateTimeField(null=True, blank=True)
    eliminada_en = models.DateTimeField(null=True, blank=True)
    foto = models.ImageField(upload_to="evidencias/%Y/%m/")
    descripcion = models.CharField(max_length=200, blank=True)
    subida_en = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Evidencia #{self.pk}"


class CategoriaProblema(models.Model):
    nombre = models.CharField(max_length=100, unique=True)
    activo = models.BooleanField(default=True)

    def __str__(self):
        return self.nombre


class ClienteEspecialidad(models.Model):
    cliente = models.ForeignKey(
        Cliente, on_delete=models.PROTECT, related_name="especialidades"
    )
    categoria = models.ForeignKey(
        CategoriaProblema, on_delete=models.PROTECT, related_name="clientes_habilitados"
    )
    activo = models.BooleanField(default=True)
    habilitada_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["cliente", "categoria"], name="cliente_especialidad_unica"
            ),
        ]
        indexes = [
            models.Index(fields=["cliente", "activo"], name="cliente_espec_activo_idx")
        ]

    def __str__(self):
        return f"{self.cliente.razon_social} → {self.categoria.nombre}"


class NivelUrgencia(models.Model):
    nombre = models.CharField(max_length=50, unique=True)
    sla_primera_respuesta_horas = models.PositiveIntegerField()
    sla_resolucion_horas = models.PositiveIntegerField()

    def __str__(self):
        return self.nombre


class Ticket(models.Model):
    """
    Pronto reportado por el cliente.

    El origen es siempre el supervisor de tienda: el técnico no genera
    tickets desde el campo (decisión de alcance validada el 31/08/2026,
    ver docs/artefactos/05-reglas-de-negocio y HU-18 retirada en Jira).
    """

    ESTADO_CHOICES = [
        ("abierto", "Pendiente"),
        ("programado", "Pendiente"),
        ("en_proceso", "En proceso"),
        ("pendiente_validacion", "En revisión"),
        ("correccion_requerida", "Corrección requerida"),
        ("resuelto", "Finalizado"),
        ("cerrado", "Finalizado"),
    ]

    tienda = models.ForeignKey(Tienda, on_delete=models.PROTECT, related_name="tickets")
    categoria = models.ForeignKey(CategoriaProblema, on_delete=models.PROTECT)
    urgencia = models.ForeignKey(NivelUrgencia, on_delete=models.PROTECT)
    reportado_por = models.ForeignKey(
        Usuario, on_delete=models.PROTECT, related_name="tickets_reportados"
    )
    tecnico_asignado = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="tickets_asignados",
    )
    fecha_programada = models.DateTimeField(null=True, blank=True)
    asignado_en = models.DateTimeField(null=True, blank=True)
    descripcion = models.TextField()
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default="abierto")
    creado_en = models.DateTimeField(auto_now_add=True)
    resuelto_en = models.DateTimeField(null=True, blank=True)
    cerrado_en = models.DateTimeField(null=True, blank=True)
    revision = models.PositiveIntegerField(default=0)

    @property
    def evidencias(self):
        # Compatibilidad con main: ambas rutas usan la misma relación.
        return self.archivos

    def __str__(self):
        return f"Ticket #{self.pk} - {self.categoria.nombre}"


class ReasignacionTicket(models.Model):
    """
    Historial de reasignaciones de un ticket entre técnicos.

    El supervisor de cuenta puede reasignar mientras el ticket no esté
    cerrado. Se conserva el historial completo en vez de sobrescribir
    tecnico_asignado sin registro, para no perder la trazabilidad que
    es el objetivo central del sistema.
    """

    ticket = models.ForeignKey(
        Ticket, on_delete=models.PROTECT, related_name="reasignaciones"
    )
    tecnico_anterior = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        null=True,
        related_name="reasignaciones_salientes",
    )
    tecnico_nuevo = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        null=True,
        related_name="reasignaciones_entrantes",
    )
    reasignado_por = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        null=True,
        related_name="reasignaciones_realizadas",
    )
    reasignado_en = models.DateTimeField(auto_now_add=True)
    motivo = models.TextField(blank=True)
    fecha_anterior = models.DateTimeField(null=True, blank=True)
    fecha_nueva = models.DateTimeField(null=True, blank=True)
    urgencia_anterior = models.ForeignKey(
        NivelUrgencia,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cambios_salientes",
    )
    urgencia_nueva = models.ForeignKey(
        NivelUrgencia,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cambios_entrantes",
    )

    def __str__(self):
        return (
            f"Ticket #{self.ticket_id}: {self.tecnico_anterior} → {self.tecnico_nuevo}"
        )


class Excepcion(models.Model):
    visita = models.ForeignKey(
        Visita, on_delete=models.PROTECT, related_name="excepciones"
    )
    tipo = models.CharField(
        max_length=20, choices=[("time_limit", "Tiempo"), ("location", "GPS")]
    )
    scope = models.CharField(
        max_length=10,
        choices=[
            ("arrival", "Llegada"),
            ("closure", "Cierre"),
            ("form", "Formulario"),
            ("legacy", "Origen no registrado"),
        ],
        default="legacy",
    )
    telemetria = models.JSONField(null=True, blank=True)
    autor = models.ForeignKey(
        Usuario, on_delete=models.PROTECT, related_name="excepciones_solicitadas"
    )
    motivo = models.TextField()
    fallo = models.CharField(max_length=50, blank=True)
    solicitada_en = models.DateTimeField(auto_now_add=True)
    decision = models.CharField(
        max_length=10,
        choices=[
            ("pending", "Pendiente"),
            ("approved", "Aprobada"),
            ("rejected", "Rechazada"),
        ],
        default="pending",
    )
    revisada_en = models.DateTimeField(null=True, blank=True)
    revisor = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="decisiones_excepcion",
    )
    motivo_decision = models.TextField(blank=True)
    revision = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["visita", "tipo", "scope"],
                name="visita_tipo_scope_excepcion_unica",
            ),
            models.CheckConstraint(
                condition=Q(scope="legacy")
                | Q(tipo="location", scope__in=["arrival", "closure"])
                | Q(tipo="time_limit", scope="form"),
                name="excepcion_scope_corresponde_tipo",
            ),
        ]


class Evento(models.Model):
    visita = models.ForeignKey(
        Visita, on_delete=models.PROTECT, related_name="eventos", null=True, blank=True
    )
    ticket = models.ForeignKey(
        Ticket, on_delete=models.PROTECT, related_name="eventos", null=True, blank=True
    )
    actor = models.ForeignKey(Usuario, on_delete=models.PROTECT, null=True, blank=True)
    fecha = models.DateTimeField(auto_now_add=True)
    tipo = models.CharField(max_length=50)
    texto = models.TextField()
    datos = models.JSONField(default=dict)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(actor__isnull=False)
                | Q(tipo="claim_release", visita__isnull=False, ticket__isnull=True),
                name="evento_actor_o_liberacion_sistema",
            )
        ]


class Operacion(models.Model):
    usuario = models.ForeignKey(Usuario, on_delete=models.PROTECT)
    clave = models.CharField(max_length=100)
    accion = models.CharField(max_length=200)
    huella = models.CharField(max_length=64)
    respuesta = models.JSONField(null=True)
    creada_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["usuario", "clave"], name="operacion_idempotente_unica"
            )
        ]
