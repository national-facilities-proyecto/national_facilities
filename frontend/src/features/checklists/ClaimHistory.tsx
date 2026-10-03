import type { Visit } from '../../types/models'
import { Card } from '../../components/ui'
import { displayDate } from '../../utils/dates'

export function ClaimHistory({ visit }: { visit: Visit }) {
  if (!visit.claimHistory?.length) return null
  return (
    <Card title="Historial de reservas">
      {visit.claimHistory.map((entry) => (
        <div key={entry.id}>
          <p>
            {entry.text} · {displayDate(entry.at)}
          </p>
          <p>
            Técnico #{entry.technicianId} · Autor:{' '}
            {entry.actorId ? `Usuario #${entry.actorId}` : 'Sistema'}
          </p>
          <p>
            Reclamo: {displayDate(entry.claimedAt)} · Vencimiento: {displayDate(entry.expiresAt)}
          </p>
        </div>
      ))}
    </Card>
  )
}
