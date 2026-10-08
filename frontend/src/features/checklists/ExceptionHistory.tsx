import { exceptionLabel, type Visit } from '../../types/models'
import { Card } from '../../components/ui'
import { displayDate } from '../../utils/dates'
import { AuditDetails } from './AuditDetails'
import { auditPerson } from '../../utils/auditPerson'

export function ExceptionHistory({ visit }: { visit: Visit }) {
  if (!visit.exceptionHistory?.length) return null
  return (
    <Card title="Historial de justificaciones y decisiones">
      <ol className="nf-audit-history">
        {visit.exceptionHistory.map((entry) => (
          <li className="nf-audit-event" key={entry.id}>
            <h3>{exceptionLabel(entry.exception)}</h3>
            <AuditDetails
              fields={[
                ['Fecha', displayDate(entry.at)],
                ['Usuario de la acción', auditPerson(entry.actorId, entry.actorName)],
                [
                  'Acción',
                  entry.kind === 'review'
                    ? 'Decisión de revisión'
                    : entry.kind === 'exception_corrected'
                      ? 'Corrección enviada'
                      : entry.kind === 'exception_reopened'
                        ? 'Revisión reabierta'
                        : entry.kind === 'exception_previous'
                          ? 'Versión anterior conservada'
                          : 'Justificación enviada',
                ],
                [
                  'Autor de la justificación',
                  auditPerson(entry.exception.authorId, entry.exception.authorName),
                ],
                ['Motivo', entry.exception.reason],
                [
                  'Estado en este evento',
                  entry.exception.approved === undefined
                    ? 'Pendiente'
                    : entry.exception.approved
                      ? 'Aprobada'
                      : 'Rechazada',
                ],
                ...(entry.exception.reviewerId !== undefined
                  ? ([
                      [
                        'Revisor',
                        auditPerson(entry.exception.reviewerId, entry.exception.reviewerName),
                      ],
                      ['Fecha de decisión', displayDate(entry.exception.reviewedAt)],
                    ] as [string, string][])
                  : []),
                ...(entry.exception.reviewReason
                  ? ([['Decisión', entry.exception.reviewReason]] as [string, string][])
                  : []),
              ]}
            />
          </li>
        ))}
      </ol>
    </Card>
  )
}
