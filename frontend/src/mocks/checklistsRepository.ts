import type { Repositories } from '../services/repositories/contracts'
import { AppError, required } from '../services/errors'
import { readDatabase, writeDatabase } from './storage'
import { delay, currentUser, allow, getVisit, mutate, listVisits, scenarioState } from './runtime'

export function createChecklistsRepository(): NonNullable<Repositories['checklists']> {
  return {
    list: (options) => listVisits('checklist', options),
    async get(id, options) {
      await delay(options)
      const db = readDatabase()
      const visit = getVisit(db, id)
      const user = currentUser(db)
      allow(user, ['technician', 'account_supervisor', 'administrator'])
      if (user.role === 'technician' && visit.technicianId && visit.technicianId !== user.id)
        throw new AppError('not_found', 'Checklist no encontrado.')
      return visit
    },
    async claim(id) {
      return mutate((db) => {
        const user = currentUser(db)
        allow(user, ['technician'])
        const visit = getVisit(db, id)
        if (scenarioState.value === 'conflict_once') {
          scenarioState.value = 'normal'
          visit.technicianId =
            db.users.find((item) => item.role === 'technician' && item.id !== user.id)?.id ?? -1
          visit.status = 'claimed'
          writeDatabase(db)
          window.dispatchEvent(new Event('nf:data'))
          throw new AppError(
            'conflict',
            'Otro técnico tomó esta visita primero. Actualiza la bolsa.',
          )
        }
        if (visit.status !== 'available' || visit.technicianId)
          throw new AppError('conflict', 'Esta visita ya fue tomada.')
        visit.technicianId = user.id
        visit.status = 'claimed'
        return visit
      })
    },
    async saveDraft(id, input) {
      return mutate((db) => {
        const visit = getVisit(db, id, true)
        required(visit.status === 'in_progress', 'Inicia la visita antes de registrar respuestas.')
        visit.answers = input.answers
        visit.workDescription = input.workDescription
        visit.evidenceIds = input.evidenceIds
        return visit
      })
    },
  }
}
