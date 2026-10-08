import hashlib
import json
from django.db import transaction
from django.db.models import Q, F
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from .models import (
    Visita,
    Ticket,
    Operacion,
    Evento,
    Evidencia,
    Tienda,
    Contrato,
    Checklist,
    PlantillaChecklist,
    Usuario,
)
from .permissions import rol_de, tiendas_visibles_para, visitas_continuables_para
from .gps import validate_gps, evaluate_gps, DEVICE_FAILURES


class Conflict(APIException):
    status_code = 409
    default_detail = "El recurso cambió. Consulta el estado real antes de reintentar."
    default_code = "conflict"


def idempotent(request, work):
    key = request.headers.get("Idempotency-Key", "")
    if not key or len(key) > 100:
        raise ValidationError(
            {
                "idempotencyKey": "Se requiere una clave de operación de 1 a 100 caracteres."
            }
        )
    fingerprint = hashlib.sha256(
        json.dumps(request.data, sort_keys=True, default=str).encode()
    ).hexdigest()
    with transaction.atomic():
        operation, _ = Operacion.objects.get_or_create(
            usuario=request.user,
            clave=key,
            defaults={
                "accion": request.method + " " + request.path,
                "huella": fingerprint,
            },
        )
        operation = Operacion.objects.select_for_update().get(pk=operation.pk)
        legacy_post = operation.accion == request.path and request.method == "POST"
        if (
            operation.accion != request.method + " " + request.path and not legacy_post
        ) or operation.huella != fingerprint:
            raise Conflict("La clave ya se usó para una operación diferente.")
        if operation.respuesta is not None:
            cached = operation.respuesta
            is_visit = cached.get("origin") in ("ticket", "checklist")
            is_ticket = request.path.startswith("/api/tickets/") and cached.get("id")
            if (
                cached.get("storeId")
                and not is_visit
                and not is_ticket
                and not tiendas_visibles_para(request.user)
                .filter(pk=cached["storeId"])
                .exists()
            ):
                raise PermissionDenied("El recurso ya no pertenece a tu alcance.")
            if (
                cached.get("origin") in ("ticket", "checklist")
                and not visible_visits(request.user)
                .filter(pk=cached.get("id"))
                .exists()
            ):
                raise PermissionDenied(
                    "La ejecución ya no está disponible para este usuario."
                )
            if cached.get("origin") in ("ticket", "checklist"):
                from .serializers import visit_data

                return visit_data(
                    visible_visits(request.user).get(pk=cached["id"]), user=request.user
                )
            if request.path.startswith("/api/tickets/") and cached.get("id"):
                from .serializers import ticket_data

                return ticket_data(
                    get_object_or_404(visible_tickets(request.user), pk=cached["id"]),
                    user=request.user,
                )
            return operation.respuesta
        data = work()
        # Serializers pueden contener Decimal, UUID o ReturnDict.
        from rest_framework.renderers import JSONRenderer

        operation.respuesta = json.loads(JSONRenderer().render(data))
        operation.save(update_fields=["respuesta"])
        return operation.respuesta


def visible_visits(user):
    queryset = Visita.objects.filter(
        Q(tienda__in=tiendas_visibles_para(user))
        | Q(pk__in=visitas_continuables_para(user).values("pk"))
    )
    if rol_de(user) == "technician":
        today = timezone.localdate()
        month = today.replace(day=1)
        queryset = queryset.filter(
            Q(tecnico=user, vigente=True)
            | Q(tecnico=user, estado="no_realizada", no_realizada_en__isnull=False)
            | Q(
                origen="checklist",
                vigente=True,
                tecnico__isnull=True,
                periodo=month,
                estado="programada",
            )
        )
    if rol_de(user) == "store_supervisor":
        queryset = queryset.filter(origen="ticket")
    return queryset


def visible_tickets(user):
    queryset = Ticket.objects.filter(
        Q(tienda__in=tiendas_visibles_para(user))
        | Q(
            pk__in=visitas_continuables_para(user)
            .exclude(ticket_origen_id=None)
            .values("ticket_origen_id")
        )
    )
    if rol_de(user) == "technician":
        queryset = queryset.filter(tecnico_asignado=user)
    return queryset


def locked_visit(user, pk, owner=True):
    # Todas las acciones de un ticket toman primero el ticket y luego la visita,
    # igual que programación. Reevalúa el alcance después de esperar el bloqueo.
    if owner:
        # Orden común: usuario (NO KEY UPDATE) -> ticket -> visita -> evidencia.
        live_user = Usuario.objects.select_for_update(no_key=True).get(pk=user.pk)
        if not live_user.is_active or rol_de(live_user) != "technician":
            raise PermissionDenied("La cuenta no admite ejecución técnica.")
    reference = get_object_or_404(visible_visits(user), pk=pk)
    if reference.ticket_origen_id:
        Ticket.objects.select_for_update().get(pk=reference.ticket_origen_id)
    visit = get_object_or_404(
        visible_visits(user).select_for_update(of=("self",)), pk=pk
    )
    if owner and (
        rol_de(user) != "technician" or visit.tecnico_id != user.pk or not visit.vigente
    ):
        raise PermissionDenied("Solo el técnico vigente puede ejecutar esta visita.")
    if owner and not visit.iniciado_en and not visit.tienda.activo:
        raise PermissionDenied("La tienda está inactiva.")
    return visit


def event(user, visit, kind, text, data=None):
    Evento.objects.create(
        actor=user,
        visita=visit,
        ticket=visit.ticket_origen,
        tipo=kind,
        texto=text,
        datos=data or {},
    )


def require_execution(visit, form=False):
    if visit.estado != "en_curso" or not visit.iniciado_en or visit.enviado_en:
        raise Conflict("La visita no está en ejecución o ya fue enviada.")
    if form and not visit.formulario_abierto_en:
        raise Conflict("Abre primero el formulario de resultados.")


def registration_editable(visit):
    return bool(
        visit.iniciado_en
        and visit.terminado_en
        and visit.formulario_abierto_en
        and (
            (visit.estado == "en_curso" and not visit.enviado_en)
            or visit.estado == "correccion_requerida"
        )
    )


def require_registration_editable(visit):
    if not registration_editable(visit):
        raise Conflict(
            "El registro solo es editable tras el fin físico o en Corrección requerida; En revisión es solo lectura."
        )


def require_evidence_editable(visit):
    if not visit.iniciado_en or visit.estado not in (
        "en_curso",
        "correccion_requerida",
    ):
        raise Conflict("La ejecución no admite cambios de evidencia.")
    if visit.estado == "en_curso" and visit.enviado_en:
        raise Conflict("El registro enviado está protegido.")


def audit_exception(user, visit, exception, kind, text):
    from .serializers import exception_data

    event(
        user,
        visit,
        kind,
        text,
        {
            "exception": exception_data(exception),
            "draftRevision": visit.borrador_revision,
            "submittedAt": visit.enviado_en.isoformat() if visit.enviado_en else None,
        },
    )


def prepare_registration_edit(user, visit):
    # El envío anterior y las aprobaciones independientes nunca se borran.
    if visit.estado == "correccion_requerida":
        from .serializers import visit_data

        snapshot = visit_data(visit)
        event(
            user,
            visit,
            "correction_edit",
            "Edición de la misma ejecución tras rechazo",
            {
                "submittedAt": (
                    visit.enviado_en.isoformat() if visit.enviado_en else None
                ),
                "draftRevision": visit.borrador_revision,
                "workDescription": visit.descripcion_trabajo,
                "answers": snapshot["answers"],
                "evidenceIds": snapshot["evidenceIds"],
            },
        )


def set_ticket_state(visit, state, completed_at=None):
    if visit.ticket_origen_id:
        values = {"estado": state}
        if completed_at is not None:
            values["resuelto_en"] = completed_at
        Ticket.objects.filter(pk=visit.ticket_origen_id).update(**values)


def persist_arrival(user, visit, location):
    visit.iniciado_en = timezone.now()
    ensure_startable(user, visit, at=visit.iniciado_en)
    visit.ubicacion_inicio = location
    visit.estado = "en_curso"
    if location["validated"]:
        visit.latitud_inicio = location["latitude"]
        visit.longitud_inicio = location["longitude"]
        visit.distancia_inicio_metros = location["distanceMeters"]
        visit.proximidad_inicio_validada = True
    visit.save()
    set_ticket_state(visit, "en_proceso")
    event(
        user,
        visit,
        "start",
        (
            "Llegada registrada"
            if location["validated"]
            else "Llegada bajo excepción pendiente"
        ),
        {"location": location},
    )


def persist_physical_end(user, visit):
    # Nunca se sustituye un cierre físico ya confirmado, ni siquiera al corregir.
    if visit.terminado_en:
        return
    require_execution(visit)
    visit.terminado_en = timezone.now()
    visit.save(update_fields=["terminado_en"])
    event(
        user,
        visit,
        "physical_end",
        "Recorrido terminado" if visit.origen == "checklist" else "Atención terminada",
        {"physicalEndedAt": visit.terminado_en.isoformat()},
    )


def request_or_correct_exception(user, visit, data):
    from .models import Excepcion

    scope = data["scope"]
    existing = visit.excepciones.filter(tipo=data["type"], scope=scope).first()
    if visit.estado not in ("programada", "en_curso", "correccion_requerida"):
        raise Conflict(
            "Solo se solicitan excepciones antes del envío o durante Corrección requerida."
        )
    if scope == "legacy" and not existing:
        raise ValidationError(
            {
                "scope": "Legacy se reserva para corregir una excepción histórica existente."
            }
        )
    telemetry = existing.telemetria if existing else None
    photo = None
    if "evidenceId" in data:
        photo = get_object_or_404(
            Evidencia.objects.select_for_update(),
            client_id=data["evidenceId"],
            visita=visit,
            autor=user,
            proposito="arrival",
            origen="camera",
            eliminada_en__isnull=True,
        )
        if scope != "arrival" or (
            photo.excepcion_id and (not existing or photo.excepcion_id != existing.pk)
        ):
            raise ValidationError(
                {
                    "evidenceId": "La fotografía no corresponde a esta excepción de llegada."
                }
            )
    if not existing and (data["type"] == "time_limit" or scope == "closure"):
        raise ValidationError(
            {
                "scope": "El cierre no requiere GPS y el formulario no vence. "
                "Solo se conservan las excepciones históricas."
            }
        )
    if data["type"] == "time_limit":
        if not visit.iniciado_en or not visit.terminado_en:
            raise Conflict(
                "La demora corresponde al registro posterior al trabajo físico."
            )
    else:
        if scope == "arrival" and not existing:
            if visit.iniciado_en:
                raise Conflict(
                    "La llegada ya está registrada; no se reemplaza su evidencia física."
                )
            ensure_startable(user, visit)
            if photo is None:
                raise ValidationError(
                    {
                        "evidenceId": "Adjunta una foto del establecimiento tomada desde la app."
                    }
                )
        if existing and "location" in data:
            raise ValidationError(
                {
                    "location": "La corrección conserva el GPS del evento original; "
                    "explica la corrección sin registrar otra llegada."
                }
            )
        if not existing:
            telemetry = evaluate_gps(
                data.get("location"), visit, data.get("failure", "")
            )
            if telemetry["validated"] or telemetry["failure"] not in (
                *DEVICE_FAILURES,
                "out_of_radius",
                "low_accuracy",
                "stale",
                "future",
            ):
                raise ValidationError(
                    {
                        "location": "Solicita una lectura fresca normal o una excepción "
                        "por fallo GPS, radio o precisión."
                    }
                )
    if existing and data["type"] == "location" and "location" not in data:
        # Conservar la lectura histórica no descarta una corrección explícita de causa.
        failure = data.get("failure", existing.fallo)
    else:
        failure = (
            telemetry["failure"]
            if telemetry
            else data.get("failure", existing.fallo if existing else "")
        )
    if existing:
        same = (
            existing.motivo == data["reason"]
            and existing.fallo == failure
            and existing.telemetria == telemetry
            and (photo is None or photo.excepcion_id == existing.pk)
        )
        if same:
            if existing.decision == "rejected":
                raise ValidationError(
                    {
                        "reason": "La excepción rechazada exige una corrección real y versionada."
                    }
                )
            return existing
        if data.get("revision") != existing.revision:
            raise Conflict(
                "La excepción cambió; consulta su versión antes de corregirla."
            )
        audit_exception(
            user,
            visit,
            existing,
            "exception_previous",
            "Versión y decisión anteriores a la corrección",
        )
        existing.revision += 1
        existing.motivo, existing.fallo, existing.telemetria = (
            data["reason"],
            failure,
            telemetry,
        )
        existing.autor = user
        existing.solicitada_en = timezone.now()
        existing.decision = "pending"
        existing.revisada_en = existing.revisor = None
        existing.motivo_decision = ""
        existing.save()
        if photo:
            photo.excepcion = existing
            photo.save(update_fields=["excepcion"])
        audit_exception(
            user,
            visit,
            existing,
            "exception_corrected",
            "Excepción corregida: " + scope,
        )
        return existing
    exception = Excepcion.objects.create(
        visita=visit,
        tipo=data["type"],
        scope=scope,
        telemetria=telemetry,
        autor=user,
        motivo=data["reason"],
        fallo=failure,
    )
    if photo:
        photo.excepcion = exception
        photo.save(update_fields=["excepcion"])
    audit_exception(
        user, visit, exception, "exception", "Excepción solicitada: " + scope
    )
    if scope == "arrival":
        persist_arrival(user, visit, telemetry)
    return exception


@transaction.atomic
def request_exception(user, pk, raw):
    from .input_serializers import ExceptionInputSerializer

    visit = locked_visit(user, pk)
    serializer = ExceptionInputSerializer(data=raw)
    serializer.is_valid(raise_exception=True)
    request_or_correct_exception(user, visit, serializer.validated_data)
    return visit


def validate_physical_end(visit):
    if not visit.terminado_en:
        raise Conflict("Registra primero el fin físico del recorrido o atención.")


def finalize(user, visit, kind):
    visit.completado_en = timezone.now()
    visit.estado = "completada"
    visit.save(update_fields=["estado", "completado_en"])
    set_ticket_state(visit, "resuelto", visit.completado_en)
    event(
        user,
        visit,
        kind,
        "Finalización aceptada",
        {
            "draftRevision": visit.borrador_revision,
            "submittedAt": visit.enviado_en.isoformat(),
            "physicalEndedAt": visit.terminado_en.isoformat(),
        },
    )


def accept_submission(user, visit, review=False):
    require_registration_editable(visit)
    validate_content(visit)
    validate_physical_end(visit)
    accepted_at = timezone.now()
    if visit.excepciones.filter(decision="rejected").exists():
        raise ValidationError(
            {
                "exceptions": "Corrige realmente todas las excepciones rechazadas antes de reenviar."
            }
        )
    pending = visit.excepciones.filter(decision="pending").exists()
    if pending and not review:
        raise Conflict(
            "Existen excepciones pendientes; envía explícitamente a revisión."
        )
    if review and not visit.excepciones.exists():
        raise ValidationError(
            {"exceptions": "Sin excepciones corresponde finalización normal."}
        )
    previous_submission = visit.enviado_en
    visit.enviado_en = accepted_at
    visit.save(update_fields=["enviado_en"])
    event(
        user,
        visit,
        "review_submission" if pending else "submission",
        "Registro completo enviado explícitamente",
        {
            "draftRevision": visit.borrador_revision,
            "submittedAt": accepted_at.isoformat(),
            "previousSubmittedAt": (
                previous_submission.isoformat() if previous_submission else None
            ),
            "exceptionVersions": [
                {"id": e.pk, "revision": e.revision, "decision": e.decision}
                for e in visit.excepciones.all()
            ],
        },
    )
    if pending:
        visit.estado = "pendiente_validacion"
        visit.save(update_fields=["estado"])
        set_ticket_state(visit, "pendiente_validacion")
    else:
        finalize(user, visit, "complete")
    return visit


@transaction.atomic
def submit_review(user, pk, raw):
    from .input_serializers import ReviewSubmissionSerializer

    visit = locked_visit(user, pk)
    serializer = ReviewSubmissionSerializer(data=raw)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    if data["revision"] != visit.borrador_revision:
        raise Conflict("Existe un registro más reciente; concilia antes de enviar.")
    if visit.estado in ("completada", "pendiente_validacion") and visit.enviado_en:
        return visit
    require_registration_editable(visit)
    pairs = [(item["type"], item["scope"]) for item in data["exceptions"]]
    if len(pairs) != len(set(pairs)):
        raise ValidationError({"exceptions": "No repitas tipo y etapa de excepción."})
    for item in data["exceptions"]:
        request_or_correct_exception(user, visit, item)
    return accept_submission(user, visit, review=True)


@transaction.atomic
def finish_physical_work(user, pk, data=None):
    visit = locked_visit(user, pk)
    if visit.terminado_en:
        return visit
    require_execution(visit)
    if visit.formulario_abierto_en:
        raise Conflict(
            "El formulario histórico ya está abierto sin fin físico registrado; "
            "requiere revisión, no timestamps inventados."
        )
    persist_physical_end(user, visit)
    return visit


def finalize_reviewed_visit(user, visit):
    if (
        visit.estado not in ("pendiente_validacion", "correccion_requerida")
        or not visit.enviado_en
    ):
        return
    if visit.excepciones.filter(decision="rejected").exists():
        visit.estado = "correccion_requerida"
        visit.save(update_fields=["estado"])
        set_ticket_state(visit, "correccion_requerida")
        return
    if visit.excepciones.exclude(decision="approved").exists():
        return
    validate_content(visit)
    validate_physical_end(visit)
    finalize(user, visit, "review_complete")


@transaction.atomic
def review_exception(user, pk, raw):
    from .input_serializers import ReviewInputSerializer

    if rol_de(user) != "account_supervisor":
        raise PermissionDenied("Solo Supervisor NF puede decidir excepciones.")
    visit = locked_visit(user, pk, owner=False)
    serializer = ReviewInputSerializer(data=raw)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    if (
        visit.estado not in ("pendiente_validacion", "correccion_requerida")
        or not visit.enviado_en
    ):
        raise Conflict(
            "Solo se decide sobre un registro completo enviado y realmente En revisión."
        )
    validate_content(visit)
    validate_physical_end(visit)
    exception = get_object_or_404(
        visit.excepciones.select_for_update(), pk=data["exceptionId"]
    )
    if (
        data["revision"] != visit.borrador_revision
        or data["exceptionRevision"] != exception.revision
    ):
        raise Conflict("El contenido o la excepción cambió; recarga antes de decidir.")
    decision = "approved" if data["approved"] else "rejected"
    if exception.decision != "pending":
        if (
            exception.decision == decision
            and exception.motivo_decision == data["reason"]
        ):
            return visit
        raise Conflict("La excepción ya tiene una decisión registrada.")
    exception.decision, exception.revisor = decision, user
    exception.motivo_decision, exception.revisada_en = data["reason"], timezone.now()
    exception.save()
    audit_exception(
        user,
        visit,
        exception,
        "review",
        "Decisión NF: " + exception.scope + " / " + decision,
    )
    finalize_reviewed_visit(user, visit)
    return visit


def claim_visit(user, pk):
    from .claims import CLAIM_DURATION

    visit = get_object_or_404(
        Visita.objects.filter(
            tienda__in=tiendas_visibles_para(user), vigente=True
        ).select_for_update(),
        pk=pk,
    )
    if rol_de(user) != "technician" or visit.origen != "checklist":
        raise PermissionDenied()
    if not visit.tienda.activo:
        raise PermissionDenied("La tienda está inactiva.")
    if not visit.iniciado_en and visit.periodo != timezone.localdate().replace(day=1):
        raise Conflict("Esta visita no corresponde al período mensual actual.")
    if visit.tecnico_id == user.pk:
        if not visit.iniciado_en and not visit.reclamo_vence_en:
            raise Conflict(
                "El reclamo histórico no tiene una fecha comprobable; requiere revisión."
            )
        if not visit.iniciado_en and visit.reclamo_vence_en <= timezone.now():
            raise Conflict(
                "La reserva venció. Actualiza la bolsa antes de reclamar de nuevo."
            )
        return visit
    if visit.tecnico_id or visit.estado != "programada":
        raise Conflict("Otro técnico ya tomó la visita.")
    if visit.periodo != timezone.localdate().replace(day=1):
        raise Conflict("Esta visita no corresponde al período actual.")
    visit.tecnico = user
    visit.reclamada_en = timezone.now()
    visit.reclamo_vence_en = visit.reclamada_en + CLAIM_DURATION
    visit.save(update_fields=["tecnico", "reclamada_en", "reclamo_vence_en"])
    event(
        user,
        visit,
        "claim",
        "Checklist reclamado",
        {
            "technicianId": user.pk,
            "claimedAt": visit.reclamada_en.isoformat(),
            "expiresAt": visit.reclamo_vence_en.isoformat(),
        },
    )
    return visit


def ensure_startable(user, visit, at=None):
    at = at or timezone.now()
    if visit.estado != "programada":
        raise Conflict("Estado incompatible con registrar llegada.")
    if visit.origen == "checklist":
        if visit.periodo != timezone.localdate(at).replace(day=1):
            raise Conflict("El checklist debe iniciarse dentro de su mes.")
        if not visit.reclamo_vence_en or at >= visit.reclamo_vence_en:
            raise Conflict("La reserva venció o no tiene fecha comprobable.")
        checklist = getattr(visit, "checklist", None)
        if checklist is None or not checklist.tareas_snapshot:
            raise Conflict(
                "La obligación no tiene tareas históricas publicadas; requiere revisión explícita."
            )
    else:
        if not visit.ticket_origen_id:
            raise Conflict("La atención histórica no tiene una incidencia vinculada.")
        from .scheduling import scheduled_day

        if scheduled_day(at) < scheduled_day(visit.fecha_programada):
            raise Conflict(
                "La atención está programada para un día posterior. "
                "Solicita al supervisor que la reprograme antes de registrar llegada."
            )
    if (
        Visita.objects.filter(
            tecnico_id=user.pk,
            iniciado_en__isnull=False,
            enviado_en__isnull=True,
            estado__in=("en_curso", "pendiente_validacion"),
        )
        .exclude(pk=visit.pk)
        .exists()
    ):
        raise Conflict(
            "Ya tienes una ejecución activa; termina o envía el registro completo antes de iniciar otra."
        )
    # La configuración actual no sustituye al radio y snapshot ya publicados.
    if not visit.radio_metros or not visit.tienda_snapshot:
        raise Conflict(
            "La ejecución histórica carece de reglas publicadas comprobables."
        )


@transaction.atomic
def start_visit(user, pk, data):
    visit = locked_visit(user, pk)
    if visit.iniciado_en:
        if visit.estado != "en_curso":
            raise Conflict("Esta ejecución no admite otro inicio.")
        return visit
    ensure_startable(user, visit)
    location = validate_gps(data.get("location"), visit)
    persist_arrival(user, visit, location)
    return visit


@transaction.atomic
def open_form(user, pk, data=None):
    visit = locked_visit(user, pk)
    if visit.formulario_abierto_en and registration_editable(visit):
        return visit
    require_execution(visit)
    validate_physical_end(visit)
    visit.formulario_abierto_en = timezone.now()
    visit.save(update_fields=["formulario_abierto_en"])
    event(
        user,
        visit,
        "open_form",
        "Primera apertura del registro final",
        {"openedAt": visit.formulario_abierto_en.isoformat()},
    )
    return visit


def evidence_ids(visit, item_id=None):
    files = Evidencia.objects.filter(
        Q(visita=visit) | Q(checklist__visita=visit),
        proposito="result",
        eliminada_en__isnull=True,
        item_id=item_id,
    )
    return [str(e.client_id) for e in files.order_by("pk")]


def validate_content(visit):
    errors = []
    if visit.origen == "ticket":
        if not visit.descripcion_trabajo.strip():
            errors.append("Describe el trabajo realizado.")
        if not evidence_ids(visit):
            errors.append("Adjunta evidencia de la resolución.")
    else:
        checklist = getattr(visit, "checklist", None)
        if checklist is None:
            raise ValidationError(
                {"content": "No hay checklist histórico publicado para esta ejecución."}
            )
        answers = {answer.item_id: answer for answer in checklist.respuestas.all()}
        if not checklist.tareas_snapshot:
            errors.append(
                "La plantilla histórica no tiene un snapshot de tareas validado."
            )
        for task in checklist.tareas_snapshot:
            answer = answers.get(task["id"])
            if not answer or answer.resultado not in ("ok", "observado", "no_aplica"):
                errors.append(f"Resultado obligatorio: {task['title']}.")
            if (
                answer
                and answer.resultado in ("observado", "no_aplica")
                and not answer.observacion.strip()
            ):
                errors.append(f"Observación obligatoria: {task['title']}.")
            if (
                task["photoRequired"]
                and (not answer or answer.resultado != "no_aplica")
                and not evidence_ids(visit, task["id"])
            ):
                errors.append(f"Fotografía obligatoria: {task['title']}.")
    if errors:
        raise ValidationError({"content": errors})


@transaction.atomic
def save_draft(user, pk, data):
    from .input_serializers import DraftSerializer
    from .models import RespuestaItem

    visit = locked_visit(user, pk)
    require_registration_editable(visit)
    serializer = DraftSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    draft = serializer.validated_data
    if draft["revision"] != visit.borrador_revision:
        raise Conflict(
            {
                "detail": "Existe un borrador más reciente. Tu editor se conserva; "
                "consulta y concilia antes de reintentar.",
                "revision": visit.borrador_revision,
            }
        )
    supplied = draft["evidenceIds"][:]
    tasks = (
        {task["id"] for task in visit.checklist.tareas_snapshot}
        if visit.origen == "checklist"
        else set()
    )
    seen = set()
    for answer in draft["answers"]:
        if answer["taskId"] not in tasks or answer["taskId"] in seen:
            raise ValidationError(
                {"answers": "Ítem ajeno a la plantilla o respuesta repetida."}
            )
        seen.add(answer["taskId"])
        supplied += answer["evidenceIds"]
        expected = set(evidence_ids(visit, answer["taskId"]))
        if not set(map(str, answer["evidenceIds"])).issubset(expected):
            raise ValidationError(
                {"answers": "Evidencia ajena o asociada a otra tarea."}
            )
    if visit.origen == "checklist" and draft["evidenceIds"]:
        raise ValidationError(
            {"evidenceIds": "La evidencia del checklist se asocia a cada tarea."}
        )
    if visit.origen == "ticket" and draft["answers"]:
        raise ValidationError(
            {
                "answers": "El ticket usa descripción técnica, no respuestas de checklist."
            }
        )
    if not set(map(str, draft["evidenceIds"])).issubset(set(evidence_ids(visit))):
        raise ValidationError(
            {"evidenceIds": "La evidencia no pertenece a esta resolución."}
        )
    if len(supplied) != len(set(map(str, supplied))):
        raise ValidationError({"evidenceIds": "No repitas asociaciones de evidencia."})
    prepare_registration_edit(user, visit)
    if visit.origen == "checklist":
        checklist = visit.checklist
        # Reemplazo atómico con control de versión; ningún PUT independiente evita este servicio.
        for answer in draft["answers"]:
            RespuestaItem.objects.update_or_create(
                checklist=checklist,
                item_id=answer["taskId"],
                defaults={
                    "resultado": {
                        "conforme": "ok",
                        "no_conforme": "observado",
                        "no_aplica": "no_aplica",
                        None: "",
                    }[answer.get("result")],
                    "observacion": answer["observation"],
                },
            )
    visit.descripcion_trabajo = draft["workDescription"]
    visit.borrador_revision += 1
    visit.save(update_fields=["descripcion_trabajo", "borrador_revision"])
    return visit


@transaction.atomic
def complete_visit(user, pk, data):
    from .input_serializers import CompletionSerializer

    visit = locked_visit(user, pk)
    serializer = CompletionSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    raw = serializer.validated_data
    if raw["revision"] != visit.borrador_revision:
        raise Conflict(
            "La versión del registro cambió; no puedes finalizar contenido que no revisaste."
        )
    if visit.estado == "completada":
        return visit
    if raw["exceptions"]:
        raise ValidationError(
            {
                "exceptions": "Registra las excepciones y envía explícitamente a revisión."
            }
        )
    return accept_submission(user, visit)


@transaction.atomic
def not_performed(user, pk, raw):
    from rest_framework import serializers

    class Input(serializers.Serializer):
        reason = serializers.CharField(min_length=10, max_length=500)

    role = rol_de(user)
    if role not in ("technician", "account_supervisor"):
        raise PermissionDenied(
            "Solo técnico propietario o Supervisor NF puede registrar No realizado."
        )
    visit = locked_visit(user, pk, owner=role == "technician")
    serializer = Input(data=raw)
    serializer.is_valid(raise_exception=True)
    if (
        visit.estado not in ("programada", "en_curso", "correccion_requerida")
        or visit.completado_en
    ):
        raise Conflict("La ejecución no admite No realizado.")
    if not visit.iniciado_en and (
        role != "account_supervisor" or visit.origen != "ticket"
    ):
        raise Conflict(
            "Antes de llegada, NF cancela una atención; la reserva de checklist se libera al vencer."
        )
    if visit.origen == "checklist" and (
        not hasattr(visit, "checklist") or not visit.checklist.tareas_snapshot
    ):
        raise Conflict(
            "La obligación histórica no tiene tareas publicadas; requiere revisión explícita."
        )
    visit.estado, visit.vigente = "no_realizada", False
    visit.justificacion = serializer.validated_data["reason"]
    visit.no_realizada_en = timezone.now()
    visit.save(update_fields=["estado", "vigente", "justificacion", "no_realizada_en"])
    event(
        user,
        visit,
        "not_performed",
        "Intento no realizado; no declara cumplimiento",
        {
            "reason": visit.justificacion,
            "at": visit.no_realizada_en.isoformat(),
            "evidenceIds": evidence_ids(visit),
            "startedAt": visit.iniciado_en.isoformat() if visit.iniciado_en else None,
        },
    )
    if visit.ticket_origen_id:
        Ticket.objects.filter(pk=visit.ticket_origen_id).update(
            estado="abierto",
            tecnico_asignado=None,
            fecha_programada=None,
            revision=F("revision") + 1,
        )
    else:
        next_visit = Visita.objects.create(
            tienda_id=visit.tienda_id,
            origen="checklist",
            periodo=visit.periodo,
            cuota=visit.cuota,
            intento_anterior=visit,
            contrato_id=visit.contrato_id,
            radio_metros=visit.radio_metros,
            tienda_snapshot=visit.tienda_snapshot,
            minimo_mensual_snapshot=visit.minimo_mensual_snapshot,
            fecha_programada=visit.fecha_programada,
        )
        checklist = visit.checklist
        Checklist.objects.create(
            visita=next_visit,
            plantilla_id=checklist.plantilla_id,
            plantilla_version=checklist.plantilla_version,
            tareas_snapshot=checklist.tareas_snapshot,
        )
        event(
            user,
            next_visit,
            "retry_published",
            "Nuevo intento de la misma obligación publicada",
            {"previousVisitId": visit.pk, "quota": visit.cuota},
        )
    return visit


@transaction.atomic
def asegurar_bolsa_mes_actual(user=None):
    """Publica la bolsa mensual con cuotas y snapshots, sin alterar visitas existentes.

    Conserva la llamada sin argumentos del comando de main. Si se proporciona
    un usuario, limita la generación a sus tiendas visibles.
    """
    from .claims import release_expired_claims
    from .generation import applicable_contract, snapshot
    from .serializers import ItemPlantillaSerializer

    today = timezone.localdate()
    period = today.replace(day=1)
    contracts = Contrato.objects.filter(activo=True, fecha_inicio__lte=today).filter(
        Q(fecha_fin__isnull=True) | Q(fecha_fin__gte=today)
    )
    stores = tiendas_visibles_para(user) if user is not None else Tienda.objects.all()
    stores = stores.filter(activo=True, cliente_id__in=contracts.values("cliente_id"))
    created_count = 0
    for store in stores.order_by("pk").select_for_update(of=("self",)):
        published = list(
            Visita.objects.filter(
                tienda=store, origen="checklist", periodo=period, vigente=True
            ).order_by("cuota")
        )
        if published:
            if [visit.cuota for visit in published] != list(
                range(1, len(published) + 1)
            ):
                raise Conflict(
                    "Las visitas mensuales publicadas tienen cuotas inconsistentes; requieren revisión."
                )
            continue
        contract = applicable_contract(store, today)
        template = PlantillaChecklist.objects.select_for_update().get(
            pk=contract.plantilla_checklist_id
        )
        tasks = list(
            ItemPlantillaSerializer(
                template.items.filter(activo=True).order_by("orden", "pk"), many=True
            ).data
        )
        if not template.activa or not tasks:
            raise Conflict("El contrato necesita una plantilla activa con tareas.")
        for quota in range(1, contract.frecuencia_visitas_mensual + 1):
            visit, created = Visita.objects.get_or_create(
                tienda=store,
                origen="checklist",
                periodo=period,
                cuota=quota,
                vigente=True,
                defaults={"fecha_programada": timezone.now(), "estado": "programada"},
            )
            if created:
                snapshot(visit, contract)
                visit.save()
                Checklist.objects.create(
                    visita=visit,
                    plantilla=template,
                    plantilla_version=template.version,
                    tareas_snapshot=tasks,
                )
                created_count += 1
    release_expired_claims(tiendas_visibles_para(user) if user is not None else None)
    return created_count
