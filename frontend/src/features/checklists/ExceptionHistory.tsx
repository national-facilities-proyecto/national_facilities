import { exceptionLabel, type Visit, type LocationException } from '../../types/models'
import { Card } from '../../components/ui'
import { displayDate } from '../../utils/dates'
import { AuditDetails } from './AuditDetails'
import { auditPerson } from '../../utils/auditPerson'

function reasonIdentity(item: LocationException) {
  return JSON.stringify([item.id ?? `${item.type}:${item.scope}`, item.authorId, item.reason])
}

export function ExceptionHistory({
  visit,
  summarized = [],
}: {
  visit: Visit
  summarized?: LocationException[]
}) {
  if (!visit.exceptionHistory?.length) return null
  const reasons = new Set(summarized.map(reasonIdentity))
  const decisions = new Set<string>()
  return (
    <Card title="Historial de justificaciones y decisiones">
      <ol className="nf-audit-history">
        {visit.exceptionHistory.map((entry) => {
          const identity = entry.exception.id ?? `${entry.exception.type}:${entry.exception.scope}`
          const reasonKey = reasonIdentity(entry.exception)
          const decisionKey = JSON.stringify([
            identity,
            entry.exception.revision,
            entry.exception.reviewerId,
            entry.exception.reviewedAt,
            entry.exception.reviewReason,
          ])
          const showReason = !reasons.has(reasonKey)
          const showDecision = Boolean(entry.exception.reviewReason) && !decisions.has(decisionKey)
          reasons.add(reasonKey)
          decisions.add(decisionKey)
          return (
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
                  ...(showReason
                    ? ([['Motivo', entry.exception.reason]] as [string, string][])
                    : []),
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
                  ...(showDecision
                    ? ([['Decisión', entry.exception.reviewReason]] as [string, string][])
                    : []),
                ]}
              />
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
