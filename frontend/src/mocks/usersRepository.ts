import type { Repositories } from '../services/repositories/contracts'
import { readDatabase } from './storage'
import { delay, currentUser, visible } from './runtime'

export function createUsersRepository(): NonNullable<Repositories['users']> {
  return {
    async list(options) {
      await delay(options)
      const db = readDatabase()
      const user = currentUser(db)
      return db.users.filter(
        (item) =>
          item.id === user.id ||
          (user.role === 'store_supervisor' &&
            item.role === 'technician' &&
            db.tickets.some(
              (ticket) => visible(user, ticket.storeId) && ticket.technicianId === item.id,
            )) ||
          (user.role === 'account_supervisor' && item.storeIds.some((id) => visible(user, id))) ||
          user.role === 'administrator',
      )
    },
  }
}
