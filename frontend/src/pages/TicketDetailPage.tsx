import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { QueryState } from '../components/feedback/QueryState'
import { PageHeader } from '../components/ui'
import { VisitEditor } from '../features/checklists/VisitEditor'
import { VisitStart } from '../features/checklists/VisitStart'
import { TicketReport } from '../features/tickets/TicketReport'
import { AppError } from '../services/errors'
export default function TicketDetailPage() {
  const { id } = useParams()
  const repos = useRepositories()
  const query = useQuery(
    useCallback(
      async (signal) => {
        let visit
        try {
          visit = await repos.visits.get(Number(id), { signal })
        } catch (error) {
          if (error instanceof AppError && error.code === 'not_found')
            throw new AppError('not_found', 'Ticket no encontrado.')
          throw error
        }
        if (visit.origin !== 'ticket') throw new AppError('not_found', 'Ticket no encontrado.')
        const store = await repos.stores.get(visit.storeId, { signal })
        return { visit, store }
      },
      [id, repos],
    ),
    false,
  )
  if (!query.data || query.status !== 'success') return <QueryState query={query} />
  const { visit, store } = query.data
  if (visit.status !== 'claimed') return <VisitEditor id={visit.id} origin="ticket" />
  return (
    <>
      <Link className="nf-link" to="/routes">
        ← Mis rutas
      </Link>
      <PageHeader title={store.name} description={store.address} />
      {visit.ticketId && <TicketReport ticketId={visit.ticketId} />}
      <VisitStart visit={visit} store={store} onStarted={query.reload} />
    </>
  )
}
