import type { Repositories } from '../services/repositories/contracts'
import { AppError, required } from '../services/errors'
import { validateLocation } from '../features/geolocation/location'
import { pendingItems } from '../features/checklists/validation'
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

export function createVisitsRepository(): NonNullable<Repositories['visits']> {
  return {
    list: (options) => listVisits('ticket', options),
    async get(id, options) {
      await delay(options)
      const db = readDatabase()
      const visit = getVisit(db, id)
      const user = currentUser(db)
      allow(user, ['technician', 'account_supervisor', 'administrator'])
      if (user.role === 'technician' && visit.technicianId !== user.id)
        throw new AppError('not_found', 'Ticket no encontrado.')
      return visit
    },
    async start(id, location) {
      return mutate((db) => {
        const visit = getVisit(db, id, true)
        required(visit.status === 'claimed', 'La visita debe estar tomada y pendiente de inicio.')
        const store = db.stores.find((item) => item.id === visit.storeId)!
        validateLocation(location, store, visit.radiusMeters)
        const now = new Date()
        visit.startLocation = location
        visit.startedAt = now.toISOString()
        if (visit.origin === 'checklist') {
          visit.timeLimitSeconds = 300
          visit.expiresAt = new Date(now.getTime() + visit.timeLimitSeconds * 1000).toISOString()
          visit.timeLimitExceeded = false
        }
        visit.status = 'in_progress'
        if (visit.ticketId) getTicket(db, visit.ticketId).status = 'in_progress'
        return visit
      })
    },
    async complete(id, location) {
      return mutate((db) => {
        const visit = getVisit(db, id, true)
        required(visit.status === 'in_progress', 'La visita no está en curso.')
        required(!pendingItems(visit).length, pendingItems(visit).join(' '))
        validateLocation(
          location,
          db.stores.find((item) => item.id === visit.storeId)!,
          visit.radiusMeters,
        )
        if (
          visit.origin === 'checklist' &&
          visit.expiresAt &&
          Date.now() >= Date.parse(visit.expiresAt)
        ) {
          visit.timeLimitExceeded = true
          throw new AppError(
            'conflict',
            'El tiempo máximo del checklist ha vencido. Envía una justificación para revisión.',
          )
        }
        visit.endLocation = location
        finish(db, visit, false)
        return visit
      })
    },
    async requestException(id, reason, failure) {
      return mutate((db) => {
        const visit = getVisit(db, id, true)
        required(
          visit.status === 'in_progress' && !pendingItems(visit).length,
          'Completa las tareas antes de solicitar la excepción.',
        )
        required(
          ['denied', 'timeout', 'unavailable'].includes(failure),
          'Solo se admite excepción al cierre por permiso denegado o falta de señal GPS.',
        )
        required(
          reason.trim().length >= 10,
          'Explica el problema de GPS en al menos 10 caracteres.',
        )
        visit.exception = {
          type: 'location',
          reason: reason.trim(),
          failure,
          requestedAt: new Date().toISOString(),
        }
        finish(db, visit, true)
        return visit
      })
    },
    async requestTimeException(id, reason) {
      return mutate((db) => {
        const visit = getVisit(db, id, true)
        required(
          visit.origin === 'checklist' && visit.status === 'in_progress',
          'El checklist no está en ejecución.',
        )
        required(
          visit.expiresAt && Date.now() >= Date.parse(visit.expiresAt),
          'El checklist aún está dentro del tiempo permitido.',
        )
        const normalized = reason.trim()
        required(
          normalized.length >= 10 && normalized.length <= 500,
          'La justificación debe tener entre 10 y 500 caracteres.',
        )
        visit.timeLimitExceeded = true
        visit.timeExceptionReason = normalized
        visit.timeExceptionStatus = 'pending'
        visit.exception = {
          type: 'time_limit',
          reason: normalized,
          failure: 'time_limit',
          requestedAt: new Date().toISOString(),
        }
        finish(db, visit, true)
        return visit
      })
    },
    async reviewException(id, approved, reason) {
      return mutate((db) => {
        const user = currentUser(db)
        allow(user, ['account_supervisor'])
        const visit = getVisit(db, id)
        required(
          visit.status === 'pending_approval' && visit.exception,
          'No hay una excepción pendiente.',
        )
        required(
          approved || reason.trim().length >= 10,
          'Indica el motivo de rechazo (mínimo 10 caracteres).',
        )
        Object.assign(visit.exception, {
          approved,
          reviewReason: reason.trim(),
          reviewerId: user.id,
          reviewedAt: new Date().toISOString(),
        })
        if (approved) {
          if (visit.exception.type === 'time_limit') visit.timeExceptionStatus = 'approved'
          finish(db, visit, false)
        } else {
          if (visit.exception.type === 'time_limit') visit.timeExceptionStatus = 'rejected'
          visit.status = 'in_progress'
          if (visit.ticketId) {
            const ticket = getTicket(db, visit.ticketId)
            ticket.status = 'in_progress'
            ticket.history.push({
              id: crypto.randomUUID(),
              actorId: user.id,
              at: new Date().toISOString(),
              text: `Excepción rechazada: ${reason.trim()}`,
            })
          }
        }
        return visit
      })
    },
  }
}
