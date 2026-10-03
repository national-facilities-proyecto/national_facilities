import type { Visit } from '../../types/models'
import { Badge, Card } from '../../components/ui'
import { EvidenceGallery } from '../../components/EvidenceGallery'
import { displayDate } from '../../utils/dates'
import { ExceptionHistory } from './ExceptionHistory'

export function VisitRecord({ visit }: { visit: Visit }) {
  return (
    <>
      <Card title="Registro de la intervención">
        <p>Inicio real: {displayDate(visit.startedAt)}</p>
        <p>
          Primera apertura: {displayDate(visit.formOpenedAt)} · Vencimiento:{' '}
          {displayDate(visit.expiresAt)}
        </p>
        <p>
          Envío aceptado: {displayDate(visit.submittedAt)} · Finalización:{' '}
          {displayDate(visit.completedAt)}
        </p>
        <p>
          Duración total: {visit.totalSeconds ?? 'No registrado'} s · Antes del formulario:{' '}
          {visit.executionSeconds ?? 'No registrado'} s · Registro:{' '}
          {visit.registrationSeconds ?? 'No registrado'} s
        </p>
        {visit.legacy && (
          <p>Historial anterior: los eventos que faltan permanecen sin registrar.</p>
        )}
        {(visit.exceptions ?? []).map((item) => (
          <p key={item.id}>
            {item.type === 'time_limit' ? 'Tiempo' : 'GPS'}: {item.reason} ·{' '}
            {item.approved === undefined ? 'Pendiente' : item.approved ? 'Aprobada' : 'Rechazada'} ·{' '}
            {item.reviewReason} · {displayDate(item.reviewedAt)} · Autor:{' '}
            {item.authorId ? `Usuario #${item.authorId}` : 'No registrado'} · Revisor:{' '}
            {item.reviewerId ? `Usuario #${item.reviewerId}` : 'Pendiente'}
          </p>
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
