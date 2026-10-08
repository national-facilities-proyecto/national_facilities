import type { Visit } from '../../types/models'
import { Card } from '../../components/ui'
import { displayDate } from '../../utils/dates'
import { AuditDetails } from './AuditDetails'
import { auditPerson } from '../../utils/auditPerson'

export function ClaimHistory({ visit }: { visit: Visit }) {
  if (!visit.claimHistory?.length) return null
  return (
    <Card title="Historial de reservas">
      <ol className="nf-audit-history">
        {visit.claimHistory.map((entry) => (
          <li className="nf-audit-event" key={entry.id}>
            <AuditDetails
              fields={[
                ['Acción', entry.text],
                ['Fecha', displayDate(entry.at)],
                ['Técnico', auditPerson(entry.technicianId, entry.technicianName)],
                ['Autor', auditPerson(entry.actorId, entry.actorName, 'Sistema')],
                ['Reserva', displayDate(entry.claimedAt)],
                ['Vencimiento', displayDate(entry.expiresAt)],
              ]}
            />
          </li>
        ))}
      </ol>
    </Card>
  )
}
