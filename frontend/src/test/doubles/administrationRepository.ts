import type {
  AdminEntities,
  AdminKind,
  User,
  Store,
  Zone,
  Specialty,
  ClientSpecialty,
} from '../../types/models'
import type { Repositories, RequestOptions } from '../../services/repositories/contracts'
import { required } from '../../services/errors'
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
          const pairs = user.coverages ?? []
          if (['technician', 'account_supervisor'].includes(user.role)) {
            required(
              pairs.length > 0 &&
                pairs.every((row) =>
                  db.zones.some((zone) => zone.id === row.zoneId && zone.clientId === row.clientId),
                ),
              'Cada cobertura necesita una zona del mismo cliente.',
            )
            required(
              new Set(pairs.map((row) => `${row.clientId}:${row.zoneId}`)).size === pairs.length,
              'No repitas coberturas.',
            )
            user.storeIds = []
          } else {
            required(pairs.length === 0, 'Este rol no utiliza cobertura.')
            if (user.role === 'store_supervisor')
              required(user.storeIds.length === 1, 'Asigna exactamente una tienda.')
            if (user.role === 'administrator') user.storeIds = []
          }
          user.coverages = pairs
        }
        if (kind === 'stores') {
          const store = next as Store
          const previous = db.stores.find((item) => item.id === store.id)
          required(
            (previous &&
              previous.zoneId == null &&
              store.zoneId == null &&
              previous.clientId === store.clientId) ||
              db.zones.some((zone) => zone.id === store.zoneId && zone.clientId === store.clientId),
            'Selecciona una zona del cliente.',
          )
        }
        if (kind === 'zones') {
          const zone = next as Zone
          required(
            db.clients.some((client) => client.id === zone.clientId),
            'Selecciona un cliente existente.',
          )
          required(
            !db.zones.some(
              (item) =>
                item.id !== zone.id && item.clientId === zone.clientId && item.name === zone.name,
            ),
            'Zona duplicada en el cliente.',
          )
          required(
            !db.stores.some(
              (store) => store.zoneId === zone.id && store.clientId !== zone.clientId,
            ) &&
              !db.users.some((user) =>
                user.coverages?.some(
                  (row) => row.zoneId === zone.id && row.clientId !== zone.clientId,
                ),
              ),
            'La zona tiene tiendas o coberturas de otro cliente.',
          )
        }
        if (kind === 'specialties') {
          const specialty = next as Specialty
          required(
            !db.specialties.some(
              (item) => item.id !== specialty.id && item.name === specialty.name,
            ),
            'Especialidad duplicada.',
          )
        }
        if (kind === 'clientSpecialties') {
          const relation = next as ClientSpecialty
          required(
            db.clients.some((item) => item.id === relation.clientId) &&
              db.specialties.some((item) => item.id === relation.categoryId),
            'Cliente o especialidad inválidos.',
          )
          required(
            !db.clientSpecialties.some(
              (item) =>
                item.id !== relation.id &&
                item.clientId === relation.clientId &&
                item.categoryId === relation.categoryId,
            ),
            'Habilitación duplicada.',
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
