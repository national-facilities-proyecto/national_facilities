import type { Visit } from '../../types/models'
export function pendingItems(
  visit: Pick<Visit, 'origin' | 'tasks' | 'answers' | 'workDescription' | 'evidenceIds'>,
): string[] {
  if (visit.origin === 'ticket')
    return [
      !visit.workDescription.trim() ? 'Describe el trabajo realizado.' : '',
      !visit.evidenceIds.length ? 'Agrega una fotografía del trabajo.' : '',
    ].filter(Boolean)
  return visit.tasks
    .filter((task) => task.active)
    .flatMap((task) => {
      const answer = visit.answers.find((item) => item.taskId === task.id)
      return [
        !answer?.result ? `Resultado pendiente: ${task.title}.` : '',
        answer?.result === 'no_conforme' && !answer.observation.trim()
          ? `Observación requerida: ${task.title}.`
          : '',
        task.photoRequired && !answer?.evidenceIds.length
          ? `Fotografía obligatoria: ${task.title}.`
          : '',
      ].filter(Boolean)
    })
}
