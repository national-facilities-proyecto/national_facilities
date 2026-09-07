from django.contrib.auth.models import AbstractUser
from django.db import models


class Rol(models.Model):
    nombre = models.CharField(max_length=50, unique=True)
    descripcion = models.TextField(blank=True)

    def __str__(self):
        return self.nombre


class Usuario(AbstractUser):
    rol = models.ForeignKey(Rol, on_delete=models.PROTECT, null=True, blank=True)
    telefono = models.CharField(max_length=20, blank=True)

    def __str__(self):
        return self.username


class Cliente(models.Model):
    razon_social = models.CharField(max_length=200)
    ruc = models.CharField(max_length=20, unique=True)
    contacto_nombre = models.CharField(max_length=150, blank=True)
    contacto_email = models.EmailField(blank=True)

    def __str__(self):
        return self.razon_social


class Tienda(models.Model):
    # La tienda es una entidad operativa independiente de quién tenga acceso a ella.
    # La relación con usuarios (supervisor de tienda, supervisor de cuenta) se
    # resuelve mediante AsignacionTienda, no con una FK directa aquí.
    cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE, related_name="tiendas")
    nombre = models.CharField(max_length=150)
    direccion = models.CharField(max_length=250)
    latitud = models.DecimalField(max_digits=9, decimal_places=6)
    longitud = models.DecimalField(max_digits=9, decimal_places=6)

    def __str__(self):
        return f"{self.nombre} ({self.cliente.razon_social})"


class AsignacionTienda(models.Model):
    """
    Relación entre un usuario y una tienda.

    Resuelve dos casos con la misma tabla:
      - Supervisor de tienda: una asignación, una tienda.
      - Supervisor de cuenta: varias asignaciones, una por cada tienda
        de su zona o cartera.

    Al desvincularse una persona, se elimina o desactiva su asignación;
    la tienda y su historial de visitas y tickets no se ven afectados.
    """
    usuario = models.ForeignKey(Usuario, on_delete=models.CASCADE, related_name="tiendas_asignadas")
    tienda = models.ForeignKey(Tienda, on_delete=models.CASCADE, related_name="usuarios_asignados")
    activo = models.BooleanField(default=True)
    asignado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("usuario", "tienda")

    def __str__(self):
        return f"{self.usuario} → {self.tienda}"


class PlantillaChecklist(models.Model):
    nombre = models.CharField(max_length=150)
    version = models.PositiveIntegerField(default=1)
    activa = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.nombre} v{self.version}"


class ItemPlantilla(models.Model):
    plantilla = models.ForeignKey(PlantillaChecklist, on_delete=models.CASCADE, related_name="items")
    descripcion = models.CharField(max_length=200)
    orden = models.PositiveIntegerField(default=0)
    activo = models.BooleanField(default=True)  # soft-deactivate, nunca se borra

    class Meta:
        ordering = ["orden"]

    def __str__(self):
        return self.descripcion


class Contrato(models.Model):
    cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE, related_name="contratos")
    plantilla_checklist = models.ForeignKey(PlantillaChecklist, on_delete=models.PROTECT)
    frecuencia_visitas_mensual = models.PositiveIntegerField(default=1)
    # Mínimo de intervenciones ("prontos") que el cliente espera al mes,
    # más allá del checklist. El sistema NO genera prontos automáticamente
    # al llegar a este número: solo alimenta el indicador de riesgo de
    # incumplimiento que ve el supervisor de cuenta (HU-20/HU-21).
    minimo_intervenciones_mensual = models.PositiveIntegerField(default=2)
    # Radio de validación de proximidad geográfica, en metros. 100 por
    # defecto: cubre el margen de error típico del GPS de un celular
    # (5-20 m en exteriores, mayor dentro de un local techado), sin dejar
    # de distinguir la presencia real en la tienda de la ejecución remota.
    radio_validacion_metros = models.PositiveIntegerField(default=100)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField(null=True, blank=True)
    activo = models.BooleanField(default=True)

    def __str__(self):
        return f"Contrato {self.cliente.razon_social} #{self.pk}"


class Visita(models.Model):
    ESTADO_CHOICES = [
        ("programada", "Programada"),
        ("en_curso", "En curso"),
        ("completada", "Completada"),
        ("pendiente_validacion", "Pendiente de validación (excepción de ubicación)"),
        ("no_realizada", "No realizada"),
    ]
    ORIGEN_CHOICES = [
        ("checklist", "Checklist mensual (bolsa compartida)"),
        ("ticket", "Generada desde un ticket"),
    ]

    tienda = models.ForeignKey(Tienda, on_delete=models.CASCADE, related_name="visitas")
    origen = models.CharField(max_length=20, choices=ORIGEN_CHOICES, default="checklist")
    tecnico = models.ForeignKey(
        Usuario, on_delete=models.PROTECT, null=True, blank=True, related_name="visitas_asignadas"
    )
    ticket_origen = models.ForeignKey(
        "Ticket", on_delete=models.SET_NULL, null=True, blank=True, related_name="visitas_generadas"
    )
    fecha_programada = models.DateTimeField()
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default="programada")
    justificacion = models.TextField(blank=True)

    # Coordenadas y distancia registradas al cierre. La distancia se
    # guarda siempre (no solo el resultado sí/no de la validación) para
    # dejar evidencia verificable ante el cliente y poder recalibrar el
    # umbral con datos reales de operación.
    latitud_cierre = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitud_cierre = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    distancia_medida_metros = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    proximidad_validada = models.BooleanField(default=False)

    # Excepción por ubicación no disponible (permiso denegado o sin señal
    # GPS). El técnico puede cerrar igual dejando esta justificación; la
    # visita queda en estado "pendiente_validacion" hasta que el
    # supervisor de cuenta la revise y la apruebe o rechace.
    excepcion_ubicacion = models.BooleanField(default=False)
    justificacion_excepcion = models.TextField(blank=True)
    excepcion_revisada_por = models.ForeignKey(
        Usuario, on_delete=models.SET_NULL, null=True, blank=True, related_name="excepciones_revisadas"
    )
    excepcion_aprobada = models.BooleanField(null=True, blank=True)  # None = pendiente

    def __str__(self):
        return f"Visita a {self.tienda.nombre} - {self.fecha_programada:%Y-%m-%d}"

class Checklist(models.Model):
    visita = models.OneToOneField(Visita, on_delete=models.CASCADE, related_name="checklist")
    plantilla = models.ForeignKey(PlantillaChecklist, on_delete=models.PROTECT)
    reporte_general = models.TextField(blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Checklist visita #{self.visita_id}"


class RespuestaItem(models.Model):
    RESULTADO_CHOICES = [
        ("ok", "Conforme"),
        ("observado", "Observado"),
        ("no_aplica", "No aplica"),
    ]

    checklist = models.ForeignKey(Checklist, on_delete=models.CASCADE, related_name="respuestas")
    item = models.ForeignKey(ItemPlantilla, on_delete=models.PROTECT)
    resultado = models.CharField(max_length=20, choices=RESULTADO_CHOICES)
    observacion = models.TextField(blank=True)

    def __str__(self):
        return f"{self.item.descripcion}: {self.resultado}"


class Evidencia(models.Model):
    # La foto se captura desde la cámara dentro de la app, nunca se sube
    # desde la galería del dispositivo. Esta tabla asume que el frontend
    # ya garantizó el origen; aquí solo se registra la asociación a la
    # sesión del checklist y el momento en que llegó al servidor.
    checklist = models.ForeignKey(Checklist, on_delete=models.CASCADE, related_name="evidencias")
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
        ("abierto", "Abierto"),
        ("programado", "Programado"),
        ("en_proceso", "En proceso"),
        ("resuelto", "Resuelto"),
        ("cerrado", "Cerrado"),
    ]

    tienda = models.ForeignKey(Tienda, on_delete=models.CASCADE, related_name="tickets")
    categoria = models.ForeignKey(CategoriaProblema, on_delete=models.PROTECT)
    urgencia = models.ForeignKey(NivelUrgencia, on_delete=models.PROTECT)
    reportado_por = models.ForeignKey(Usuario, on_delete=models.PROTECT, related_name="tickets_reportados")
    tecnico_asignado = models.ForeignKey(
        Usuario, on_delete=models.SET_NULL, null=True, blank=True, related_name="tickets_asignados"
    )
    fecha_programada = models.DateTimeField(null=True, blank=True)
    descripcion = models.TextField()
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default="abierto")
    creado_en = models.DateTimeField(auto_now_add=True)
    resuelto_en = models.DateTimeField(null=True, blank=True)

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
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="reasignaciones")
    tecnico_anterior = models.ForeignKey(
        Usuario, on_delete=models.SET_NULL, null=True, related_name="reasignaciones_salientes"
    )
    tecnico_nuevo = models.ForeignKey(
        Usuario, on_delete=models.SET_NULL, null=True, related_name="reasignaciones_entrantes"
    )
    reasignado_por = models.ForeignKey(
        Usuario, on_delete=models.SET_NULL, null=True, related_name="reasignaciones_realizadas"
    )
    reasignado_en = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Ticket #{self.ticket_id}: {self.tecnico_anterior} → {self.tecnico_nuevo}"
