import type { Visit } from '../../types/models'
import { Card } from '../../components/ui'
import { displayDate } from '../../utils/dates'

export function ExceptionHistory({ visit }: { visit: Visit }) {
  if (!visit.exceptionHistory?.length) return null
  return (
    <Card title="Historial de justificaciones y decisiones">
      <ol>
        {visit.exceptionHistory.map((entry) => (
          <li key={entry.id}>
            <p>
              {displayDate(entry.at)} · Usuario #{entry.actorId} ·{' '}
              {entry.exception.type === 'time_limit' ? 'Tiempo' : 'GPS'} ·{' '}
              {entry.kind === 'review'
                ? entry.exception.approved
                  ? 'Aprobada'
                  : 'Rechazada'
                : entry.kind === 'exception_corrected'
                  ? 'Corrección enviada'
                  : entry.kind === 'exception_reopened'
                    ? 'Revisión reabierta'
                    : 'Justificación enviada'}
            </p>
            <p>{entry.exception.reason}</p>
            {entry.exception.reviewReason && <p>Decisión: {entry.exception.reviewReason}</p>}
          </li>
        ))}
      </ol>
    </Card>
  )
}
