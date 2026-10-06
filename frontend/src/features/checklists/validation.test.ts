import { expect, it } from 'vitest'
import { pendingItems } from './validation'
import type { Visit } from '../../types/models'
const base: Pick<Visit, 'origin' | 'tasks' | 'answers' | 'workDescription' | 'evidenceIds'> = {
  origin: 'checklist',
  tasks: [{ id: 1, title: 'Tablero', active: true, order: 1, photoRequired: true }],
  answers: [],
  workDescription: '',
  evidenceIds: [],
}
it('No aplica requiere motivo y exime foto obligatoria', () => {
  expect(
    pendingItems({
      ...base,
      answers: [{ taskId: 1, result: 'no_aplica', observation: '', evidenceIds: [] }],
    }),
  ).toEqual(['Observación requerida: Tablero.'])
  expect(
    pendingItems({
      ...base,
      answers: [
        {
          taskId: 1,
          result: 'no_aplica',
          observation: 'No hay tablero instalado.',
          evidenceIds: [],
        },
      ],
    }),
  ).toEqual([])
})
it('No conforme requiere observación/foto; Conforme solo foto configurada', () => {
  expect(
    pendingItems({
      ...base,
      answers: [{ taskId: 1, result: 'no_conforme', observation: '', evidenceIds: [] }],
    }),
  ).toHaveLength(2)
  expect(
    pendingItems({
      ...base,
      answers: [{ taskId: 1, result: 'conforme', observation: '', evidenceIds: [] }],
    }),
  ).toEqual(['Fotografía obligatoria: Tablero.'])
  expect(
    pendingItems({
      ...base,
      tasks: [{ ...base.tasks[0], photoRequired: false }],
      answers: [{ taskId: 1, result: 'conforme', observation: '', evidenceIds: [] }],
    }),
  ).toEqual([])
})
