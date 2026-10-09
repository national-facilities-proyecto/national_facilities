import { operationalVisit } from './visitsRepository'
import type { Repositories } from '../../services/repositories/contracts'
import { AppError, required } from '../../services/errors'
import { readDatabase, writeDatabase } from './storage'
import { delay, currentUser, allow, getVisit, mutate, listVisits, scenarioState } from './runtime'

export function createChecklistsRepository(): NonNullable<Repositories['checklists']> {
  return {
    list: async (options) => (await listVisits('checklist', options)).map(operationalVisit),
    async get(id, options) {
      await delay(options)
      const db = readDatabase()
      const visit = getVisit(db, id)
      const user = currentUser(db)
      allow(user, ['technician', 'account_supervisor', 'administrator'])
      if (user.role === 'technician' && visit.technicianId && visit.technicianId !== user.id)
        throw new AppError('not_found', 'Checklist no encontrado.')
      return operationalVisit(visit)
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
        return operationalVisit(visit)
      })
    },
    async saveDraft(id, input) {
      return mutate((db) => {
        const visit = getVisit(db, id, true)
        required(
          ['in_progress', 'correction_required'].includes(visit.status) && visit.formOpenedAt,
          'Inicia la visita antes de registrar respuestas.',
        )
        if ((input.revision ?? 0) !== (visit.revision ?? 0))
          throw new AppError('conflict', 'Borrador modificado en otra sesión.')
        visit.revision = (visit.revision ?? 0) + 1
        visit.answers = input.answers
        visit.workDescription = input.workDescription
        visit.evidenceIds = input.evidenceIds
        return operationalVisit(visit)
      })
    },
  }
}
