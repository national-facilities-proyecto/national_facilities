import { useCallback } from 'react'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useQuery } from '../../hooks/useQuery'
import { QueryState } from '../../components/feedback/QueryState'
import { EvidenceGallery } from '../../components/EvidenceGallery'
import { Badge, Card } from '../../components/ui'
import { displayDate } from '../../utils/dates'
import { ticketStatusLabels } from '../../types/models'
export function TicketReport({ ticketId }: { ticketId: number }) {
  const repos = useRepositories()
  const query = useQuery(
    useCallback((signal) => repos.tickets.get(ticketId, { signal }), [repos, ticketId]),
    false,
  )
  if (!query.data || query.status !== 'success') return <QueryState query={query} />
  const ticket = query.data
  return (
    <Card title={`Reporte original · Ticket #${ticket.id}`}>
      <div className="nf-actions">
        <Badge>{ticket.category}</Badge>
        <Badge>Prioridad {ticket.priority}</Badge>
        <Badge>{ticketStatusLabels[ticket.status]}</Badge>
      </div>
      <p>{ticket.description}</p>
      <p>Reportada: {displayDate(ticket.createdAt)}</p>
      {ticket.evidenceIds.length ? (
        <EvidenceGallery ids={ticket.evidenceIds} />
      ) : (
        <p>Sin evidencia original adjunta.</p>
      )}
    </Card>
  )
}
