import type { Repositories } from '../services/repositories/contracts'
import { AppError } from '../services/errors'
import { readDatabase } from './storage'
import { delay, currentUser, visible, scenarioState } from './runtime'

export function createStoresRepository(): NonNullable<Repositories['stores']> {
  return {
    async list(options) {
      await delay(options)
      const db = readDatabase()
      const user = currentUser(db)
      return scenarioState.value === 'empty'
        ? []
        : db.stores.filter((store) => visible(user, store.id))
    },
    async get(id, options) {
      await delay(options)
      const db = readDatabase()
      const user = currentUser(db)
      const store = db.stores.find((item) => item.id === id && visible(user, id))
      if (!store) throw new AppError('not_found', 'Tienda no encontrada.')
      return store
    },
  }
}
