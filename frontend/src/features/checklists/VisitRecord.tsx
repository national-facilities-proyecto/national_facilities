import { type Visit } from '../../types/models'
import { Badge, Card } from '../../components/ui'
import { EvidenceGallery } from '../../components/EvidenceGallery'
import { VisitTiming } from './VisitTiming'
import { ExceptionSummary } from './ExceptionSummary'
import { ExceptionHistory } from './ExceptionHistory'

export function VisitRecord({ visit }: { visit: Visit }) {
  return (
    <>
      <Card title="Registro de la intervención">
        <VisitTiming visit={visit} />
        {(visit.exceptions?.length
          ? visit.exceptions
          : visit.exception
            ? [visit.exception]
            : []
        ).map((item, index) => (
          <ExceptionSummary key={item.id ?? index} item={item} />
        ))}
      </Card>
      <ExceptionHistory visit={visit} />
      {visit.answers.map((answer) => (
        <Card
          key={answer.taskId}
          title={
            visit.tasks.find((task) => task.id === answer.taskId)?.title ?? `Ítem #${answer.taskId}`
          }
        >
          <Badge>
            {answer.result === 'conforme'
              ? 'Conforme'
              : answer.result === 'no_conforme'
                ? 'No conforme'
                : answer.result === 'no_aplica'
                  ? 'No aplica'
                  : 'Pendiente'}
          </Badge>
          <p>{answer.observation}</p>
          <EvidenceGallery ids={answer.evidenceIds} />
        </Card>
      ))}
      {visit.origin === 'ticket' && (
        <Card title="Trabajo técnico">
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
