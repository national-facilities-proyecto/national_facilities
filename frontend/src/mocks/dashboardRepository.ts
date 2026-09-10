import type { Dashboard } from '../types/models'
import type { Repositories } from '../services/repositories/contracts'
import { localDate } from '../utils/dates'
import { readDatabase } from './storage'
import { delay, currentUser, allow, visible } from './runtime'

export function createDashboardRepository(): NonNullable<Repositories['dashboard']> {
  return {
    async get(options) {
      await delay(options)
      const db = readDatabase()
      const user = currentUser(db)
      allow(user, ['account_supervisor', 'administrator'])
      const month = localDate().slice(0, 7)
      const visits = db.visits.filter((item) => visible(user, item.storeId))
      const monthly = visits.filter(
        (item) =>
          item.origin === 'checklist' && localDate(new Date(item.scheduledAt)).startsWith(month),
      )
      const tickets = db.tickets.filter((item) => visible(user, item.storeId))
      const ticketsByStatus: Dashboard['ticketsByStatus'] = {
        open: 0,
        scheduled: 0,
        in_progress: 0,
        pending_approval: 0,
        resolved: 0,
        closed: 0,
      }
      tickets.forEach((item) => ticketsByStatus[item.status]++)
      const resolved = tickets.filter((item) => item.resolvedAt)
      return {
        compliance: monthly.length
          ? Math.round(
              (monthly.filter((item) => item.status === 'completed').length / monthly.length) * 100,
            )
          : null,
        pendingVisits: visits.filter(
          (item) => !['completed', 'pending_approval'].includes(item.status),
        ).length,
        pendingExceptions: visits.filter((item) => item.status === 'pending_approval').length,
        ticketsByStatus,
        averageHours: resolved.length
          ? resolved.reduce(
              (sum, ticket) =>
                sum +
                (new Date(ticket.resolvedAt!).getTime() - new Date(ticket.createdAt).getTime()) /
                  3600000,
              0,
            ) / resolved.length
          : null,
        risks: db.contracts
          .filter(
            (contract) =>
              contract.active &&
              db.stores.some(
                (store) => store.clientId === contract.clientId && visible(user, store.id),
              ),
          )
          .map((contract) => ({
            client: db.clients.find((client) => client.id === contract.clientId)?.name ?? 'Cliente',
            required: contract.monthlyInterventions,
            completed: resolved.filter(
              (ticket) =>
                localDate(new Date(ticket.resolvedAt!)).startsWith(month) &&
                db.stores.find((store) => store.id === ticket.storeId)?.clientId ===
                  contract.clientId,
            ).length,
          })),
      }
    },
  }
}
