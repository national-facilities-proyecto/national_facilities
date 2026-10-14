import type { ChecklistTask, Template } from '../../types/models'
import { required } from '../../services/errors'

export function newTemplateTask(tasks: ChecklistTask[]): ChecklistTask {
  return {
    id: Math.min(0, ...tasks.map((task) => task.id)) - 1,
    title: '',
    active: true,
    photoRequired: true,
    order: tasks.length + 1,
  }
}

export function buildTemplate(
  id: number,
  name: string,
  version: string,
  active: boolean,
  tasks: ChecklistTask[],
): Template {
  required(name.trim(), 'Completa Nombre de plantilla.')
  required(
    tasks.length && tasks.every((task) => task.title.trim()),
    'Agrega al menos un ítem con descripción.',
  )
  required(
    Number.isInteger(Number(version)) && Number(version) > 0,
    'La versión debe ser un entero positivo.',
  )
  return {
    id,
    name: name.trim(),
    version: Number(version),
    active,
    tasks: tasks.map((task, index) => ({ ...task, order: index + 1 })),
  }
}
