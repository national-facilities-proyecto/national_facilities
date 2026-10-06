import type { Repositories } from '../../services/repositories/contracts'
import { AppError, required } from '../../services/errors'
import {
  distanceMeters,
  LocationError,
  validateLocation,
} from '../../features/geolocation/location'
import { pendingItems } from '../../features/checklists/validation'
import type {
  Visit,
  LocationException,
  ExceptionHistoryEntry,
  ReviewSubmission,
  ExceptionInput,
} from '../../types/models'
import type { MockDatabase } from './fixtures'
import { readDatabase } from './storage'
import {
  delay,
  currentUser,
  allow,
  getVisit,
  getTicket,
  mutate,
  listVisits,
  finish,
} from './runtime'

export function operationalVisit(visit: Visit): Visit {
  visit.phase =
    visit.status === 'correction_required'
      ? 'correction_required'
      : visit.status === 'pending_approval' && visit.submittedAt
        ? 'in_review'
        : visit.status === 'completed'
          ? 'finished'
          : visit.status === 'cancelled'
            ? 'not_performed'
            : visit.formOpenedAt
              ? 'results'
              : visit.physicalEndedAt
                ? 'physical_finished'
                : visit.startedAt
                  ? 'physical_work'
                  : visit.origin === 'ticket'
                    ? 'scheduled'
                    : visit.technicianId
                      ? 'reserved'
                      : 'available'
  visit.readOnly = ['pending_approval', 'completed', 'cancelled'].includes(visit.status)
  visit.occupiesTechnician = Boolean(
    visit.startedAt &&
    !visit.submittedAt &&
    ['in_progress', 'pending_approval'].includes(visit.status),
  )
  visit.gpsExceptionPending = Boolean(
    visit.exceptions?.some((item) => item.type === 'location' && item.approved === undefined),
  )
  visit.serverNow = new Date().toISOString()
  visit.receivedAt = performance.now()
  return visit
}
function audit(
  visit: Visit,
  exception: LocationException,
  actorId: number,
  kind: ExceptionHistoryEntry['kind'],
) {
  visit.exceptionHistory = [
    ...(visit.exceptionHistory ?? []),
    {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actorId,
      kind,
      exception: structuredClone(exception),
    },
  ]
}
export function createVisitsRepository(): Repositories['visits'] {
  const repository: Repositories['visits'] = {
    async list(options) {
      return (await listVisits('ticket', options)).map(operationalVisit)
    },
    async get(id, options) {
      await delay(options)
      const db = readDatabase()
      const visit = getVisit(db, id)
      const user = currentUser(db)
      allow(user, ['technician', 'account_supervisor', 'administrator'])
      if (user.role === 'technician' && visit.technicianId && visit.technicianId !== user.id)
        throw new AppError('not_found', 'Trabajo no encontrado.')
      return operationalVisit(visit)
    },
    async recovery(options) {
      const all = [
        ...(await listVisits('checklist', options)),
        ...(await listVisits('ticket', options)),
      ]
        .map(operationalVisit)
        .filter((v) => v.technicianId === currentUser().id)
      const active = all.filter((v) => v.occupiesTechnician)
      required(
        active.length <= 1,
        'Integridad incompatible: varias ejecuciones activas. Requiere revisión explícita.',
      )
      return {
        activeExecution: active[0],
        reservations: all.filter((v) => v.phase === 'reserved'),
        corrections: all.filter((v) => v.phase === 'correction_required'),
        inReview: all.filter((v) => v.phase === 'in_review'),
      }
    },
    async pendingReviews(options) {
      allow(currentUser(), ['account_supervisor'])
      return [...(await listVisits('checklist', options)), ...(await listVisits('ticket', options))]
        .map(operationalVisit)
        .filter(
          (v) =>
            v.phase === 'in_review' &&
            v.submittedAt &&
            !pendingItems(v).length &&
            v.exceptions?.some((e) => e.approved === undefined),
        )
    },
    async start(id, location) {
      return mutate((db) => {
        const visit = getVisit(db, id, true)
        required(visit.status === 'claimed', 'La visita debe estar tomada y pendiente de inicio.')
        required(
          !db.visits.some(
            (v) =>
              v.id !== id &&
              v.technicianId === visit.technicianId &&
              operationalVisit(v).occupiesTechnician,
          ),
          'Ya tienes un trabajo en curso.',
        )
        required(
          visit.origin !== 'ticket' || Date.now() >= Date.parse(visit.scheduledAt),
          'No puedes registrar llegada antes de la fecha programada.',
        )
        validateLocation(
          location,
          db.stores.find((item) => item.id === visit.storeId)!,
          visit.radiusMeters ?? 100,
        )
        visit.startLocation = location
        visit.startedAt = new Date().toISOString()
        visit.timeLimitExceeded = false
        visit.status = 'in_progress'
        if (visit.ticketId) getTicket(db, visit.ticketId).status = 'in_progress'
        return operationalVisit(visit)
      })
    },
    async recordEndGps(id, location) {
      return mutate((db) => {
        const visit = getVisit(db, id, true)
        required(visit.status === 'in_progress' && visit.startedAt, 'Registra primero la llegada.')
        if (!visit.physicalEndedAt) {
          validateLocation(
            location,
            db.stores.find((item) => item.id === visit.storeId)!,
            visit.radiusMeters ?? 100,
          )
          visit.endLocation = location
          visit.physicalEndedAt = new Date().toISOString()
        }
        return operationalVisit(visit)
      })
    },
    async openForm(id) {
      return mutate((db) => {
        const visit = getVisit(db, id, true)
        required(
          visit.physicalEndedAt && visit.status === 'in_progress',
          'Termina primero el trabajo físico.',
        )
        if (!visit.formOpenedAt) {
          visit.formOpenedAt = new Date().toISOString()
          visit.expiresAt = new Date(Date.parse(visit.formOpenedAt) + 300000).toISOString()
          visit.timeLimitSeconds = 300
        }
        return operationalVisit(visit)
      })
    },
    async complete(id, input) {
      return submit(id, input, false)
    },
    async submitReview(id, input) {
      return submit(id, input, true)
    },
    async requestException(id, input) {
      return mutate((db) => correctException(db, id, input))
    },
    async requestTimeException(id, reason, revision) {
      return repository.requestException(id, {
        type: 'time_limit',
        scope: 'form',
        reason,
        revision,
      })
    },
    async reviewException(id, approved, reason, exceptionId, versions) {
      return mutate((db) => {
        allow(currentUser(db), ['account_supervisor'])
        const visit = getVisit(db, id)
        required(
          visit.status === 'pending_approval' && visit.submittedAt,
          'Solo se decide después del envío completo.',
        )
        const exception = visit.exceptions?.find((e) => e.id === exceptionId)
        required(
          exception &&
            versions?.revision === (visit.revision ?? 0) &&
            versions.exceptionRevision === exception.revision,
          'Selecciona la revisión vigente.',
        )
        required(reason.trim().length >= 10, 'Indica el motivo de decisión.')
        Object.assign(exception, {
          approved,
          decision: approved ? 'approved' : 'rejected',
          reviewReason: reason,
          reviewedAt: new Date().toISOString(),
          reviewerId: currentUser(db).id,
        })
        audit(visit, exception, currentUser(db).id, 'review')
        if (!approved) {
          visit.status = 'correction_required'
          if (visit.ticketId) getTicket(db, visit.ticketId).status = 'correction_required'
        } else if (visit.exceptions?.every((e) => e.approved === true)) finish(db, visit, false)
        visit.exception = exception
        return operationalVisit(visit)
      })
    },
  }
  const correctException = (db: MockDatabase, id: number, input: ExceptionInput) => {
    const visit = getVisit(db, id, true)
    required(
      ['claimed', 'in_progress', 'correction_required'].includes(visit.status),
      'No se corrigen registros En revisión.',
    )
    required(input.reason.trim().length >= 10, 'Explica el motivo en al menos 10 caracteres.')
    const list = visit.exceptions ?? []
    const existing = list.find((e) => e.type === input.type && e.scope === input.scope)
    let telemetry = existing?.telemetry
    let failure = input.failure ?? existing?.failure ?? ''
    if (input.type === 'location' && (input.location || !existing)) {
      const location = input.location
      const store = { ...db.stores.find((s) => s.id === visit.storeId)!, ...visit.storeSnapshot }
      const radius = visit.radiusMeters ?? 100
      if (location && !['denied', 'timeout', 'unavailable'].includes(failure)) {
        // La causa se evalúa sobre la nueva lectura real, igual que en la API.
        failure = ''
        try {
          validateLocation(location, store, radius)
        } catch (cause) {
          if (!(cause instanceof LocationError)) throw cause
          failure =
            cause.reason === 'outside'
              ? 'out_of_radius'
              : cause.reason === 'inaccurate'
                ? 'low_accuracy'
                : cause.reason
        }
      }
      required(
        ['denied', 'timeout', 'unavailable', 'out_of_radius', 'low_accuracy'].includes(failure),
        'Solicita una lectura fresca normal o una excepción por fallo GPS, radio o precisión.',
      )
      telemetry = {
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        accuracy: location?.accuracy ?? null,
        capturedAt: location?.capturedAt ?? null,
        distanceMeters: location ? Math.round(distanceMeters(location, store) * 100) / 100 : null,
        radiusMeters: radius,
        validated: false,
        failure,
      }
    }
    if (
      existing &&
      existing.reason === input.reason &&
      existing.failure === failure &&
      (
        [
          'latitude',
          'longitude',
          'accuracy',
          'capturedAt',
          'distanceMeters',
          'radiusMeters',
          'validated',
          'failure',
          'legacy',
        ] as const
      ).every((key) => existing.telemetry?.[key] === telemetry?.[key])
    ) {
      required(existing.approved !== false, 'La excepción rechazada exige una corrección real.')
      return operationalVisit(visit)
    }
    if (existing) {
      required(input.revision === existing.revision, 'La excepción cambió de versión.')
      audit(visit, existing, currentUser(db).id, 'exception_previous')
    }
    if (input.type === 'time_limit')
      required(
        visit.expiresAt && Date.now() >= Date.parse(visit.expiresAt),
        'El formulario todavía no ha vencido.',
      )
    else if (!existing) {
      if (input.scope === 'arrival') {
        required(
          !visit.startedAt &&
            !db.visits.some(
              (v) =>
                v.id !== id &&
                v.technicianId === visit.technicianId &&
                operationalVisit(v).occupiesTechnician,
            ),
          'Ya tienes un trabajo en curso.',
        )
        required(
          visit.origin !== 'ticket' || Date.now() >= Date.parse(visit.scheduledAt),
          'No puedes registrar llegada antes de la fecha programada.',
        )
        visit.startedAt = new Date().toISOString()
        visit.status = 'in_progress'
        if (visit.ticketId) getTicket(db, visit.ticketId).status = 'in_progress'
      } else {
        required(
          visit.startedAt && !visit.physicalEndedAt,
          'El cierre físico ya está confirmado o no se inició.',
        )
        visit.physicalEndedAt = new Date().toISOString()
      }
    }
    const exception: LocationException = {
      id: existing?.id ?? list.length + 1,
      revision: (existing?.revision ?? -1) + 1,
      type: input.type,
      scope: input.scope,
      reason: input.reason,
      failure,
      requestedAt: new Date().toISOString(),
      authorId: currentUser(db).id,
      decision: 'pending',
      telemetry,
    }
    visit.exceptions = [...list.filter((e) => e.id !== existing?.id), exception]
    visit.exception = exception
    if (input.type === 'time_limit') {
      visit.timeLimitExceeded = true
      visit.timeExceptionStatus = 'pending'
    }
    audit(visit, exception, currentUser(db).id, existing ? 'exception_corrected' : 'exception')
    return operationalVisit(visit)
  }
  const submit = (id: number, input: ReviewSubmission, review: boolean) =>
    mutate((db) => {
      const visit = getVisit(db, id, true)
      if (input.revision !== (visit.revision ?? 0))
        throw new AppError('conflict', 'Existe un borrador más reciente.')
      if (
        visit.status === 'completed' ||
        (review && visit.status === 'pending_approval' && visit.submittedAt)
      )
        return operationalVisit(visit)
      required(
        ['in_progress', 'correction_required'].includes(visit.status) &&
          visit.physicalEndedAt &&
          visit.formOpenedAt,
        'Completa las etapas físicas y abre el formulario.',
      )
      required(!pendingItems(visit).length, pendingItems(visit).join(' '))
      required(review || !input.exceptions.length, 'Registra excepciones y envía a revisión.')
      const pairs = input.exceptions.map((item) => `${item.type}:${item.scope}`)
      required(new Set(pairs).size === pairs.length, 'No repitas tipo y etapa de excepción.')
      if (review) for (const item of input.exceptions) correctException(db, id, item)
      required(
        visit.endLocation || visit.exceptions?.some((e) => e.scope === 'closure'),
        'Falta cierre persistido.',
      )
      required(
        !visit.exceptions?.some((e) => e.approved === false),
        'Corrige las excepciones rechazadas.',
      )
      required(
        !visit.expiresAt ||
          Date.now() < Date.parse(visit.expiresAt) ||
          visit.exceptions?.some((e) => e.type === 'time_limit'),
        'El plazo venció. Registra justificación.',
      )
      const pending = Boolean(visit.exceptions?.some((e) => e.approved === undefined))
      required(
        !review || visit.exceptions?.length,
        'Sin excepciones corresponde finalización normal.',
      )
      required(!pending || review, 'Envía explícitamente a revisión.')
      visit.submittedAt = new Date().toISOString()
      finish(db, visit, pending)
      return operationalVisit(visit)
    })
  return repository
}
