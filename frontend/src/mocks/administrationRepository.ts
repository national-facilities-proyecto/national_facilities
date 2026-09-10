import type { AdminEntities, AdminKind, User } from '../types/models'
import type { Repositories, RequestOptions } from '../services/repositories/contracts'
import { required } from '../services/errors'
import { readDatabase } from './storage'
import { delay, currentUser, allow, mutate, scenarioState } from './runtime'

export function createAdministrationRepository(): NonNullable<Repositories['administration']> {
  return {
    async list<K extends AdminKind>(
      kind: K,
      options?: RequestOptions,
    ): Promise<AdminEntities[K][]> {
      await delay(options)
      const db = readDatabase()
      allow(currentUser(db), ['administrator'])
      return (scenarioState.value === 'empty' ? [] : db[kind]) as AdminEntities[K][]
    },
    async save<K extends AdminKind>(kind: K, entity: AdminEntities[K]): Promise<AdminEntities[K]> {
      return mutate((db) => {
        const actor = currentUser(db)
        allow(actor, ['administrator'])
        const entities = db[kind] as AdminEntities[K][]
        const next = {
          ...entity,
          id: entity.id || Math.max(0, ...entities.map((item) => item.id)) + 1,
        }
        if (kind === 'users') {
          const user = next as User
          required(
            user.id !== actor.id || (user.active && user.role === 'administrator'),
            'No puedes desactivar ni quitar tu propio rol administrador.',
          )
          required(
            !db.users.some(
              (item) =>
                item.id !== user.id && item.email.toLowerCase() === user.email.toLowerCase(),
            ),
            'Ya existe un usuario con ese correo.',
          )
        }
        const index = entities.findIndex((item) => item.id === next.id)
        if (index < 0) entities.push(next)
        else entities[index] = next
        return next
      })
    },
  }
}
