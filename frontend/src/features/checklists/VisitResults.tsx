import type { Visit } from '../../types/models'
import { Badge, Card } from '../../components/ui'
import { EvidenceGallery } from '../../components/EvidenceGallery'

export function VisitResults({ visit }: { visit: Visit }) {
  const taskIds = new Set(visit.tasks.map((task) => task.id))
  const tasks = [
    ...visit.tasks,
    ...visit.answers
      .filter((answer) => !taskIds.has(answer.taskId))
      .map((answer) => ({ id: answer.taskId, title: `Actividad histórica #${answer.taskId}` })),
  ]
  return (
    <>
      {tasks.map((task) => {
        const answer = visit.answers.find((item) => item.taskId === task.id)
        return (
          <Card key={task.id} title={task.title}>
            <Badge>
              {answer?.result === 'conforme'
                ? 'Conforme'
                : answer?.result === 'no_conforme'
                  ? 'No conforme'
                  : answer?.result === 'no_aplica'
                    ? 'No aplica'
                    : 'Pendiente'}
            </Badge>
            {answer?.observation && <p>{answer.observation}</p>}
            <EvidenceGallery ids={answer?.evidenceIds ?? []} />
          </Card>
        )
      })}
      {visit.origin === 'checklist' && visit.workDescription.trim() && (
        <Card title="Reporte general del checklist">
          <p>{visit.workDescription}</p>
        </Card>
      )}
      {visit.origin === 'ticket' && (
        <Card title="Trabajo realizado">
          <p>{visit.workDescription}</p>
          <EvidenceGallery ids={visit.evidenceIds} />
        </Card>
      )}
      {visit.origin === 'checklist' && visit.evidenceIds.length > 0 && (
        <Card title="Evidencia histórica sin asociación a ítem">
          <EvidenceGallery ids={visit.evidenceIds} />
        </Card>
      )}
    </>
  )
}
