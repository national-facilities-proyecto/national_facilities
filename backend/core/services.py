from datetime import timedelta
import hashlib
import json
import math
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from .models import Visita, Ticket, Operacion, Evento, Evidencia
from .permissions import rol_de, tiendas_visibles_para


class Conflict(APIException):
    status_code = 409
    default_detail = "El recurso cambió. Consulta el estado real antes de reintentar."
    default_code = "conflict"


def idempotent(request, work):
    key = request.headers.get("Idempotency-Key", "")
    if not key or len(key) > 100:
        raise ValidationError({"idempotencyKey": "Se requiere una clave de operación de 1 a 100 caracteres."})
    fingerprint = hashlib.sha256(json.dumps(request.data, sort_keys=True, default=str).encode()).hexdigest()
    with transaction.atomic():
        operation, _ = Operacion.objects.get_or_create(
            usuario=request.user, clave=key,
            defaults={"accion": request.path, "huella": fingerprint})
        operation = Operacion.objects.select_for_update().get(pk=operation.pk)
        if operation.accion != request.path or operation.huella != fingerprint:
            raise Conflict("La clave ya se usó para una operación diferente.")
        if operation.respuesta is not None:
            cached = operation.respuesta
            if cached.get("storeId") and not tiendas_visibles_para(request.user).filter(pk=cached["storeId"]).exists():
                raise PermissionDenied("El recurso ya no pertenece a tu alcance.")
            if cached.get("origin") in ("ticket", "checklist") and not visible_visits(request.user).filter(pk=cached.get("id")).exists():
                raise PermissionDenied("La ejecución ya no está disponible para este usuario.")
            if cached.get("origin") in ("ticket", "checklist"):
                from .serializers import visit_data
                return visit_data(visible_visits(request.user).get(pk=cached["id"]))
            if request.path.startswith("/api/tickets/") and cached.get("id"):
                from .serializers import ticket_data
                return ticket_data(get_object_or_404(visible_tickets(request.user), pk=cached["id"]))
            return operation.respuesta
        data = work()
        # Serializers pueden contener Decimal, UUID o ReturnDict.
        from rest_framework.renderers import JSONRenderer
        operation.respuesta = json.loads(JSONRenderer().render(data))
        operation.save(update_fields=["respuesta"])
        return operation.respuesta


def visible_visits(user):
    queryset = Visita.objects.filter(tienda__in=tiendas_visibles_para(user))
    if rol_de(user) == "technician":
        today = timezone.localdate()
        month = today.replace(day=1)
        queryset = queryset.filter(vigente=True).filter(
            Q(tecnico=user) | Q(origen="checklist", tecnico__isnull=True, periodo=month, estado="programada"))
    if rol_de(user) == "store_supervisor":
        queryset = queryset.filter(origen="ticket")
    return queryset


def visible_tickets(user):
    queryset = Ticket.objects.filter(tienda__in=tiendas_visibles_para(user))
    if rol_de(user) == "technician":
        queryset = queryset.filter(tecnico_asignado=user)
    return queryset


def locked_visit(user, pk, owner=True):
    # Todas las acciones de un ticket toman primero el ticket y luego la visita,
    # igual que programación. Reevalúa el alcance después de esperar el bloqueo.
    reference = get_object_or_404(visible_visits(user), pk=pk)
    if reference.ticket_origen_id:
        Ticket.objects.select_for_update().get(pk=reference.ticket_origen_id)
    visit = get_object_or_404(visible_visits(user).select_for_update(of=("self",)), pk=pk)
    if owner and (rol_de(user) != "technician" or visit.tecnico_id != user.pk or not visit.vigente):
        raise PermissionDenied("Solo el técnico vigente puede ejecutar esta visita.")
    if owner and not visit.tienda.activo:
        raise PermissionDenied("La tienda está inactiva.")
    return visit


def event(user, visit, kind, text, data=None):
    Evento.objects.create(actor=user, visita=visit, ticket=visit.ticket_origen,
                          tipo=kind, texto=text, datos=data or {})


def validate_gps(data, visit):
    if not isinstance(data, dict):
        raise ValidationError({"location": "Se requiere una lectura GPS."})
    values = {}
    for key in ("latitude", "longitude", "accuracy", "capturedAt"):
        value = data.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValidationError({"location": f"{key}: debe ser un número finito."})
        values[key] = value
    if abs(values["latitude"]) > 90 or abs(values["longitude"]) > 180 or values["accuracy"] < 0:
        raise ValidationError({"location": "Coordenadas o precisión inválidas."})
    # Alineado con los controles GPS ya existentes del frontend de esta rama.
    now_ms = timezone.now().timestamp() * 1000
    if now_ms - values["capturedAt"] > 60000 or values["capturedAt"] > now_ms + 5000:
        raise ValidationError({"location": "La lectura GPS caducó. Solicita una nueva."})
    radius = visit.radio_metros
    if not radius or not visit.tienda_snapshot:
        raise Conflict("Esta ejecución histórica carece de contrato/GPS registrado; requiere revisión.")
    if values["accuracy"] > min(radius, 100):
        raise ValidationError({"location": "Precisión insuficiente para el radio contractual."})
    lat = float(visit.tienda_snapshot["latitude"])
    lon = float(visit.tienda_snapshot["longitude"])
    rad = math.pi / 180
    a = math.sin((lat-values["latitude"])*rad/2)**2 + math.cos(lat*rad)*math.cos(values["latitude"]*rad)*math.sin((lon-values["longitude"])*rad/2)**2
    distance = 6371000 * 2 * math.atan2(math.sqrt(a), math.sqrt(max(0, 1-a)))
    if distance > radius:
        raise ValidationError({"location": f"Fuera del radio permitido: {distance:.1f} m / {radius} m."})
    return {**values, "distanceMeters": round(distance, 2), "radiusMeters": radius, "validated": True}


def require_execution(visit, form=False):
    if visit.estado != "en_curso" or not visit.iniciado_en or visit.enviado_en:
        raise Conflict("La visita no está en ejecución o ya fue enviada.")
    if form and not visit.formulario_abierto_en:
        raise Conflict("Abre primero el formulario de resultados.")


def registration_editable(visit):
    return bool(visit.iniciado_en and visit.formulario_abierto_en and (
        (visit.estado == "en_curso" and not visit.enviado_en) or
        (visit.estado == "pendiente_validacion" and (
            not visit.enviado_en or visit.excepciones.filter(decision="rejected").exists()))))


def require_registration_editable(visit):
    if not registration_editable(visit):
        raise Conflict("El registro enviado está protegido. Una revisión rechazada permite corregirlo en la misma ejecución.")


def audit_exception(user, visit, exception, kind, text):
    from .serializers import exception_data
    event(user, visit, kind, text, {"exception": exception_data(exception),
          "draftRevision": visit.borrador_revision,
          "submittedAt": visit.enviado_en.isoformat() if visit.enviado_en else None})


def prepare_registration_edit(user, visit):
    """Reabrir tras rechazo conserva el envío y decisiones anteriores en eventos."""
    if visit.estado != "pendiente_validacion" or not visit.enviado_en:
        return
    require_registration_editable(visit)
    from .serializers import visit_data
    snapshot = visit_data(visit)
    event(user, visit, "correction_started", "Corrección del registro tras rechazo",
          {"submittedAt": visit.enviado_en.isoformat(), "draftRevision": visit.borrador_revision,
           "workDescription": visit.descripcion_trabajo, "answers": snapshot["answers"],
           "evidenceIds": snapshot["evidenceIds"], "location": visit.ubicacion_cierre})
    visit.enviado_en = None
    visit.save(update_fields=["enviado_en"])
    for exception in visit.excepciones.filter(decision="approved"):
        # La aprobación anterior no autoriza contenido corregido posterior.
        exception.revision += 1
        exception.decision = "pending"
        exception.revisada_en = None
        exception.revisor = None
        exception.motivo_decision = ""
        exception.save()
        audit_exception(user, visit, exception, "exception_reopened", "Nueva revisión del contenido corregido: "+exception.tipo)


def request_or_correct_exception(user, visit, data):
    from .models import Excepcion
    if data["type"] == "time_limit":
        if timezone.now() < visit.formulario_vence_en:
            raise ValidationError({"reason": "El formulario todavía está dentro del plazo."})
    elif data.get("failure") not in ("denied", "timeout", "unavailable"):
        raise ValidationError({"failure": "Solo se admite GPS no disponible al cierre."})
    existing = visit.excepciones.filter(tipo=data["type"]).first()
    if existing:
        same = existing.motivo == data["reason"] and existing.fallo == data.get("failure", "")
        if same and existing.decision != "rejected":
            return existing
        require_registration_editable(visit)
        if data.get("revision") != existing.revision:
            raise Conflict("La justificación cambió; recarga la revisión antes de corregirla.")
        prepare_registration_edit(user, visit)
        existing.revision += 1
        existing.motivo = data["reason"]
        existing.fallo = data.get("failure", "")
        existing.autor = user
        existing.solicitada_en = timezone.now()
        existing.decision = "pending"
        existing.revisada_en = None
        existing.revisor = None
        existing.motivo_decision = ""
        existing.save()
        audit_exception(user, visit, existing, "exception_corrected", "Justificación corregida: "+existing.tipo)
        return existing
    exception = Excepcion.objects.create(visita=visit, tipo=data["type"], autor=user,
        motivo=data["reason"], fallo=data.get("failure", ""))
    audit_exception(user, visit, exception, "exception", "Solicitud de revisión: "+exception.tipo)
    return exception


def submit_review(user, pk, raw):
    from .input_serializers import ReviewSubmissionSerializer
    visit = locked_visit(user, pk)
    serializer = ReviewSubmissionSerializer(data=raw)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    if data["revision"] != visit.borrador_revision:
        raise Conflict("Existe un registro más reciente. Conserva tu editor y concilia antes de enviar.")
    if visit.estado == "completada":
        return visit
    if visit.estado == "pendiente_validacion" and visit.enviado_en and not visit.excepciones.filter(decision="rejected").exists():
        return visit  # Reintento aceptado, sin segundo envío ni decisiones nuevas.
    require_registration_editable(visit)
    validate_content(visit)
    types = [item["type"] for item in data["exceptions"]]
    if len(types) != len(set(types)):
        raise ValidationError({"exceptions": "No repitas el tipo de justificación."})
    if timezone.now() >= visit.formulario_vence_en and "time_limit" not in types:
        raise ValidationError({"exceptions": "Incluye la justificación por demora; el plazo original no cambia."})
    if data.get("location") is not None:
        location = validate_gps(data["location"], visit)
    else:
        location = None
        if "location" not in types:
            raise ValidationError({"location": "Solicita GPS de cierre o justifica su indisponibilidad."})
    # Comprueba todas las versiones antes de reabrir otras aprobaciones.
    existing = {e.tipo: e for e in visit.excepciones.all()}
    for item in data["exceptions"]:
        if item["type"] in existing and item.get("revision") != existing[item["type"]].revision:
            raise Conflict("La revisión cambió; consulta su estado actual antes de reenviar.")
    prepare_registration_edit(user, visit)
    for item in data["exceptions"]:
        # La reapertura propia de esta transacción puede incrementar una aprobación.
        current = visit.excepciones.filter(tipo=item["type"]).first()
        request_or_correct_exception(user, visit, {**item, **({"revision": current.revision} if current else {})})
    if visit.excepciones.filter(decision="rejected").exists():
        raise ValidationError({"exceptions": "Corrige todas las justificaciones rechazadas antes de reenviar."})
    if location:
        visit.ubicacion_cierre = location
        visit.latitud_cierre = location["latitude"]
        visit.longitud_cierre = location["longitude"]
        visit.distancia_medida_metros = location["distanceMeters"]
        visit.proximidad_validada = True
    accepted_at = timezone.now()
    if accepted_at >= visit.formulario_vence_en and not visit.excepciones.filter(tipo="time_limit").exists():
        raise Conflict("Venció el plazo durante el envío. Incluye la justificación por demora sin reiniciar el reloj.")
    visit.enviado_en = accepted_at
    visit.estado = "pendiente_validacion"
    visit.save()
    if visit.ticket_origen_id:
        Ticket.objects.filter(pk=visit.ticket_origen_id).update(estado="pendiente_validacion")
    event(user, visit, "review_submission", "Registro completo enviado para revisión",
          {"draftRevision": visit.borrador_revision, "submittedAt": visit.enviado_en.isoformat(), "location": location})
    return visit


def record_end_gps(user, pk, data):
    visit = locked_visit(user, pk)
    if not visit.iniciado_en or not visit.formulario_abierto_en or visit.estado not in ("en_curso", "pendiente_validacion"):
        raise Conflict("La visita no admite registro de GPS de cierre.")
    location = validate_gps(data.get("location"), visit)
    visit.ubicacion_cierre = location
    visit.latitud_cierre = location["latitude"]
    visit.longitud_cierre = location["longitude"]
    visit.distancia_medida_metros = location["distanceMeters"]
    visit.proximidad_validada = True
    visit.save(update_fields=["ubicacion_cierre", "latitud_cierre", "longitud_cierre", "distancia_medida_metros", "proximidad_validada"])
    event(user, visit, "end_gps", "Lectura GPS de cierre registrada", {"location": location})
    finalize_reviewed_visit(user, visit)
    return visit


def finalize_reviewed_visit(user, visit):
    """Una aprobación nunca puede ocultar otra excepción pendiente."""
    if visit.estado != "pendiente_validacion" or not visit.enviado_en:
        return
    if visit.excepciones.exclude(decision="approved").exists():
        return
    time_required = visit.enviado_en >= visit.formulario_vence_en
    time_ok = not time_required or visit.excepciones.filter(tipo="time_limit", decision="approved").exists()
    gps_ok = bool(visit.ubicacion_cierre) or visit.excepciones.filter(tipo="location", decision="approved").exists()
    if not time_ok or not gps_ok:
        return
    validate_content(visit)
    visit.completado_en = timezone.now()
    visit.estado = "completada"
    visit.save(update_fields=["estado", "completado_en"])
    if visit.ticket_origen_id:
        Ticket.objects.filter(pk=visit.ticket_origen_id).update(estado="resuelto", resuelto_en=visit.completado_en)
    event(user, visit, "review_complete", "Finalización aceptada tras revisión de todas las excepciones")


def claim_visit(user, pk):
    from .claims import CLAIM_DURATION
    visit = get_object_or_404(Visita.objects.filter(tienda__in=tiendas_visibles_para(user), vigente=True).select_for_update(), pk=pk)
    if rol_de(user) != "technician" or visit.origen != "checklist":
        raise PermissionDenied()
    if not visit.tienda.activo:
        raise PermissionDenied("La tienda está inactiva.")
    if not visit.iniciado_en and visit.periodo != timezone.localdate().replace(day=1):
        raise Conflict("Esta visita no corresponde al período mensual actual.")
    if visit.tecnico_id == user.pk:
        if not visit.iniciado_en and not visit.reclamo_vence_en:
            raise Conflict("El reclamo histórico no tiene una fecha comprobable; requiere revisión.")
        if not visit.iniciado_en and visit.reclamo_vence_en <= timezone.now():
            raise Conflict("La reserva venció. Actualiza la bolsa antes de reclamar de nuevo.")
        return visit
    if visit.tecnico_id or visit.estado != "programada":
        raise Conflict("Otro técnico ya tomó la visita.")
    if visit.periodo != timezone.localdate().replace(day=1):
        raise Conflict("Esta visita no corresponde al período actual.")
    visit.tecnico = user
    visit.reclamada_en = timezone.now()
    visit.reclamo_vence_en = visit.reclamada_en + CLAIM_DURATION
    visit.save(update_fields=["tecnico", "reclamada_en", "reclamo_vence_en"])
    event(user, visit, "claim", "Checklist reclamado", {"technicianId": user.pk,
          "claimedAt": visit.reclamada_en.isoformat(), "expiresAt": visit.reclamo_vence_en.isoformat()})
    return visit


def start_visit(user, pk, data):
    visit = locked_visit(user, pk)
    if visit.iniciado_en:
        if visit.estado != "en_curso":
            raise Conflict("Esta visita ya no admite otro inicio.")
        return visit
    if visit.estado != "programada":
        raise Conflict("Estado incompatible con el inicio; no se inventan timestamps históricos.")
    if visit.origen == "checklist" and visit.periodo != timezone.localdate().replace(day=1):
        raise Conflict("El checklist debe iniciarse dentro de su mes; no tiene un día obligatorio.")
    if visit.origen == "checklist" and (not visit.reclamo_vence_en or visit.reclamo_vence_en <= timezone.now()):
        raise Conflict("La reserva venció o no tiene una fecha comprobable. Actualiza la visita.")
    if not visit.contrato_id:
        raise Conflict("La visita no tiene contrato aplicable.")
    today = timezone.localdate()
    contract = visit.contrato
    if not contract.activo or contract.fecha_inicio > today or (contract.fecha_fin and contract.fecha_fin < today):
        raise ValidationError({"contract": "El contrato no está vigente."})
    location = validate_gps(data.get("location"), visit)
    visit.iniciado_en = timezone.now()
    if visit.origen == "checklist" and visit.periodo != timezone.localdate(visit.iniciado_en).replace(day=1):
        raise Conflict("El período mensual terminó antes de aceptar el inicio.")
    if visit.origen == "checklist" and visit.iniciado_en >= visit.reclamo_vence_en:
        raise Conflict("La reserva venció antes de aceptar el inicio. Actualiza la bolsa.")
    visit.ubicacion_inicio = location
    visit.estado = "en_curso"
    visit.save(update_fields=["iniciado_en", "ubicacion_inicio", "estado"])
    if visit.ticket_origen_id:
        ticket = Ticket.objects.select_for_update().get(pk=visit.ticket_origen_id)
        ticket.estado = "en_proceso"
        ticket.save(update_fields=["estado"])
    event(user, visit, "start", "Trabajo iniciado", {"location": location})
    return visit


def open_form(user, pk):
    visit = locked_visit(user, pk)
    require_execution(visit)
    if not visit.formulario_abierto_en:
        visit.formulario_abierto_en = timezone.now()
        visit.formulario_vence_en = visit.formulario_abierto_en + timedelta(minutes=5)
        visit.save(update_fields=["formulario_abierto_en", "formulario_vence_en"])
        event(user, visit, "open_form", "Primera apertura del formulario",
              {"deadline": visit.formulario_vence_en.isoformat()})
    return visit


def evidence_ids(visit, item_id=None):
    files = Evidencia.objects.filter(Q(visita=visit) | Q(checklist__visita=visit), eliminada_en__isnull=True, item_id=item_id)
    return [str(e.client_id) for e in files.order_by("pk")]


def validate_content(visit):
    errors = []
    if visit.origen == "ticket":
        if not visit.descripcion_trabajo.strip():
            errors.append("Describe el trabajo realizado.")
        if not evidence_ids(visit):
            errors.append("Adjunta evidencia de la resolución.")
    else:
        checklist = visit.checklist
        answers = {answer.item_id: answer for answer in checklist.respuestas.all()}
        if not checklist.tareas_snapshot:
            errors.append("La plantilla histórica no tiene un snapshot de tareas validado.")
        for task in checklist.tareas_snapshot:
            answer = answers.get(task["id"])
            if not answer or not answer.resultado:
                errors.append(f"Resultado obligatorio: {task['title']}.")
            if answer and answer.resultado == "observado" and not answer.observacion.strip():
                errors.append(f"Observación obligatoria: {task['title']}.")
            if task["photoRequired"] and not evidence_ids(visit, task["id"]):
                errors.append(f"Fotografía obligatoria: {task['title']}.")
    if errors:
        raise ValidationError({"content": errors})


def save_draft(user, pk, data):
    from .input_serializers import DraftSerializer
    from .models import RespuestaItem
    visit = locked_visit(user, pk)
    require_registration_editable(visit)
    serializer = DraftSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    draft = serializer.validated_data
    if draft["revision"] != visit.borrador_revision:
        raise Conflict({"detail": "Existe un borrador más reciente. Tu editor se conserva; consulta y concilia antes de reintentar.",
                        "revision": visit.borrador_revision})
    supplied = draft["evidenceIds"][:]
    tasks = {task["id"] for task in visit.checklist.tareas_snapshot} if visit.origen == "checklist" else set()
    seen = set()
    for answer in draft["answers"]:
        if answer["taskId"] not in tasks or answer["taskId"] in seen:
            raise ValidationError({"answers": "Ítem ajeno a la plantilla o respuesta repetida."})
        seen.add(answer["taskId"])
        supplied += answer["evidenceIds"]
        expected = set(evidence_ids(visit, answer["taskId"]))
        if not set(map(str, answer["evidenceIds"])).issubset(expected):
            raise ValidationError({"answers": "Evidencia ajena o asociada a otra tarea."})
    if visit.origen == "checklist" and draft["evidenceIds"]:
        raise ValidationError({"evidenceIds": "La evidencia del checklist se asocia a cada tarea."})
    if visit.origen == "ticket" and draft["answers"]:
        raise ValidationError({"answers": "El ticket usa descripción técnica, no respuestas de checklist."})
    if not set(map(str, draft["evidenceIds"])).issubset(set(evidence_ids(visit))):
        raise ValidationError({"evidenceIds": "La evidencia no pertenece a esta resolución."})
    if len(supplied) != len(set(map(str, supplied))):
        raise ValidationError({"evidenceIds": "No repitas asociaciones de evidencia."})
    prepare_registration_edit(user, visit)
    if visit.origen == "checklist":
        checklist = visit.checklist
        # Reemplazo atómico con control de versión; ningún PUT independiente evita este servicio.
        for answer in draft["answers"]:
            RespuestaItem.objects.update_or_create(checklist=checklist, item_id=answer["taskId"],
                defaults={"resultado": {"conforme": "ok", "no_conforme": "observado", "no_aplica": "no_aplica", None: ""}[answer.get("result")],
                          "observacion": answer["observation"]})
    visit.descripcion_trabajo = draft["workDescription"]
    visit.borrador_revision += 1
    visit.save(update_fields=["descripcion_trabajo", "borrador_revision"])
    return visit


def complete_visit(user, pk, data):
    visit = locked_visit(user, pk)
    if visit.estado == "completada":
        return visit
    require_execution(visit, form=True)
    if timezone.now() >= visit.formulario_vence_en:
        raise Conflict({"detail": "Venció el formulario. Conserva el borrador y envía una justificación.", "code": "form_expired"})
    validate_content(visit)
    location = validate_gps(data.get("location"), visit)
    now = timezone.now()
    if now >= visit.formulario_vence_en:
        raise Conflict("El formulario venció durante la validación. Conserva el borrador y envía una justificación.")
    visit.ubicacion_cierre = location
    visit.latitud_cierre = location["latitude"]
    visit.longitud_cierre = location["longitude"]
    visit.distancia_medida_metros = location["distanceMeters"]
    visit.proximidad_validada = True
    visit.enviado_en = now
    visit.completado_en = now
    visit.estado = "completada"
    visit.save()
    if visit.ticket_origen_id:
        ticket = Ticket.objects.select_for_update().get(pk=visit.ticket_origen_id)
        ticket.estado = "resuelto"
        ticket.resuelto_en = now
        ticket.save(update_fields=["estado", "resuelto_en"])
    event(user, visit, "complete", "Resultados enviados y finalización aceptada", {"location": location})
    return visit
