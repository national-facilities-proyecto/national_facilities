import type { Repositories } from '../../services/repositories/contracts'
import { readDatabase } from './storage'
import { delay, currentUser, visible } from './runtime'

export function createUsersRepository(): NonNullable<Repositories['users']> {
  return {
    async eligible(storeId, options) {
      await delay(options)
      const db = readDatabase()
      const actor = currentUser(db)
      if (actor.role !== 'account_supervisor' || !visible(actor, storeId, db)) return []
      return db.users
        .filter((user) => user.active && user.role === 'technician' && visible(user, storeId, db))
        .map((user) => ({
          ...user,
          storeIds: [storeId],
          coverages: user.coverages?.filter((row) => {
            const store = db.stores.find((item) => item.id === storeId)
            return row.clientId === store?.clientId && row.zoneId === store.zoneId
          }),
        }))
    },
    async list(options) {
      await delay(options)
      const db = readDatabase()
      const user = currentUser(db)
      const users = db.users.filter(
        (item) =>
          item.id === user.id ||
          (user.role === 'store_supervisor' &&
            item.role === 'technician' &&
            db.tickets.some(
              (ticket) => visible(user, ticket.storeId) && ticket.technicianId === item.id,
            )) ||
          (user.role === 'account_supervisor' &&
            db.stores.some(
              (store) => visible(user, store.id, db) && visible(item, store.id, db),
            )) ||
          user.role === 'administrator',
      )
      if (user.role === 'administrator') return users
      const stores = db.stores.filter((store) => visible(user, store.id, db))
      return users.map((item) => ({
        ...item,
        storeIds: stores.filter((store) => visible(item, store.id, db)).map((store) => store.id),
        coverages:
          item.coverages?.filter((row) =>
            stores.some((store) => store.clientId === row.clientId && store.zoneId === row.zoneId),
          ) ?? [],
      }))
    },
  }
}
