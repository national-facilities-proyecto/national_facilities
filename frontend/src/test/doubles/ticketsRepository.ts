import type { Repositories } from '../../services/repositories/contracts'
import { required } from '../../services/errors'
import { operationDate } from '../../utils/dates'
import { readDatabase } from './storage'
import {
  delay,
  currentUser,
  allow,
  visible,
  continuable,
  getTicket,
  mutate,
  scenarioState,
} from './runtime'

export function createTicketsRepository(): NonNullable<Repositories['tickets']> {
  return {
    async catalogs() {
      const db = readDatabase()
      const user = currentUser(db)
      const clients = new Set(
        db.stores.filter((store) => visible(user, store.id, db)).map((store) => store.clientId),
      )
      return {
        categories: db.specialties
          .filter(
            (item) =>
              item.active &&
              (user.role !== 'store_supervisor' ||
                db.clientSpecialties.some(
                  (relation) =>
                    relation.categoryId === item.id &&
                    relation.active &&
                    clients.has(relation.clientId),
                )),
          )
          .map(({ id, name }) => ({ id, name })),
        priorities: ['Alta', 'Media', 'Baja'].map((name, index) => ({
          id: index + 1,
          name,
          firstResponseHours: 2,
          resolutionHours: 24,
        })),
      }
    },
    async list(options) {
      await delay(options)
      const db = readDatabase()
      const user = currentUser(db)
      return scenarioState.value === 'empty'
        ? []
        : db.tickets.filter(
            (item) =>
              (visible(user, item.storeId, db) ||
                db.visits.some(
                  (visit) => visit.ticketId === item.id && continuable(user, visit),
                )) &&
              (user.role !== 'technician' || item.technicianId === user.id),
          )
    },
    async get(id, options) {
      await delay(options)
      return getTicket(readDatabase(), id)
    },
    async create(input) {
      return mutate((db) => {
        const user = currentUser(db)
        allow(user, ['store_supervisor'])
        required(visible(user, input.storeId), 'La tienda no pertenece a tu sesión.')
        const store = db.stores.find((item) => item.id === input.storeId)
        required(
          db.specialties.some(
            (item) =>
              item.name === input.category &&
              item.active &&
              db.clientSpecialties.some(
                (relation) =>
                  relation.clientId === store?.clientId &&
                  relation.categoryId === item.id &&
                  relation.active,
              ),
          ),
          'Especialidad no habilitada para este cliente.',
        )
        required(
          input.description.trim().length >= 10 &&
            input.description.length <= 500 &&
            ['Alta', 'Media', 'Baja'].includes(input.priority),
          'Completa los campos del reporte.',
        )
        const ticket = {
          ...input,
          id: Math.max(100, ...db.tickets.map((item) => item.id)) + 1,
          reporterId: user.id,
          createdAt: new Date().toISOString(),
          status: 'open' as const,
          technicalEvidenceIds: [],
          history: [
            {
              id: crypto.randomUUID(),
              at: new Date().toISOString(),
              actorId: user.id,
              text: 'Incidencia reportada.',
            },
          ],
        }
        db.tickets.unshift(ticket)
        return ticket
      })
    },
    async schedule(id, technicianId, day, priority, reason) {
      const scheduledAt = /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00-05:00` : day
      return mutate((db) => {
        const user = currentUser(db)
        allow(user, ['account_supervisor'])
        const ticket = getTicket(db, id)
        required(
          !['closed', 'resolved', 'pending_approval', 'in_progress'].includes(ticket.status),
          'Solo se pueden programar incidencias abiertas o programadas.',
        )
        const technician = db.users.find(
          (item) =>
            item.id === technicianId &&
            item.active &&
            item.role === 'technician' &&
            visible(item, ticket.storeId),
        )
        required(technician, 'Selecciona un técnico activo de esta cuenta.')
        required(
          !Number.isNaN(new Date(scheduledAt).getTime()) &&
            operationDate(new Date(scheduledAt)) >= operationDate(),
          'La fecha no puede ser anterior a hoy.',
        )
        required(
          !ticket.technicianId || reason.trim().length >= 10,
          'Indica el motivo de reprogramación o reasignación.',
        )
        ticket.history.push({
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          actorId: user.id,
          text: `${ticket.technicianId ? 'Reprogramación / reasignación' : 'Programación'}: ${technician.name}, ${scheduledAt}. ${reason.trim()}`,
        })
        Object.assign(ticket, { technicianId, scheduledAt, priority, status: 'scheduled' })
        let visit = db.visits.find((item) => item.ticketId === id && item.status !== 'cancelled')
        if (visit) Object.assign(visit, { technicianId, scheduledAt, status: 'claimed' })
        else {
          visit = {
            id: Math.max(100, ...db.visits.map((item) => item.id)) + 1,
            ticketId: id,
            storeId: ticket.storeId,
            origin: 'ticket',
            technicianId,
            scheduledAt,
            status: 'claimed',
            tasks: [],
            answers: [],
            workDescription: '',
            evidenceIds: [],
            radiusMeters:
              db.contracts.find(
                (item) =>
                  item.active &&
                  item.clientId ===
                    db.stores.find((store) => store.id === ticket.storeId)?.clientId,
              )?.radiusMeters ?? 100,
          }
          db.visits.push(visit)
        }
        ticket.visitId = visit.id
        return ticket
      })
    },
  }
}
