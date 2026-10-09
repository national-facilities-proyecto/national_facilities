import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { QueryState } from '../components/feedback/QueryState'
import { QueryFeedback } from '../components/feedback/QueryFeedback'
import { Card, EmptyState, PageHeader } from '../components/ui'
import { exceptionLabel } from '../types/models'
import { displayDate } from '../utils/dates'
import { Badge } from '../components/ui'
import { EvidenceGallery } from '../components/EvidenceGallery'
export default function PendingReviewsPage() {
  const repos = useRepositories()
  const query = useQuery(
    useCallback(
      async (signal) => {
        const [visits, users] = await Promise.all([
          repos.visits.pendingReviews({ signal }),
          repos.users.list({ signal }),
        ])
        return { visits, users }
      },
      [repos],
    ),
  )
  if (query.status !== 'success' || !query.data) return <QueryState query={query} />
  return (
    <>
      <PageHeader
        title="Revisiones pendientes"
        description="Registros completos enviados que esperan una decisión dentro de tu cobertura."
      />
      <QueryFeedback query={query} />
      {!query.data.visits.length && <EmptyState>No hay revisiones pendientes.</EmptyState>}
      {query.data.visits.map((visit) => (
        <Card key={visit.id}>
          <h2>{visit.storeSnapshot?.name ?? `Tienda #${visit.storeId}`}</h2>
          <p>
            {visit.origin === 'checklist' ? 'Checklist' : 'Incidencia'} ·{' '}
            {query.data?.users.find((user) => user.id === visit.technicianId)?.name ??
              'Técnico no registrado'}
          </p>
          <p>Enviado: {displayDate(visit.submittedAt)}</p>
          <Badge>En revisión</Badge>
          <ul className="nf-timeline">
            {visit.exceptions
              ?.filter((item) => item.approved === undefined)
              .map((item) => (
                <li key={item.id}>
                  <strong>{exceptionLabel(item)}</strong>
                  <p>{item.reason}</p>
                  <EvidenceGallery ids={item.evidenceIds ?? []} />
                </li>
              ))}
          </ul>
          <Link className="nf-link" to={`/technical-supervisor/checklists/${visit.id}`}>
            Revisar
          </Link>
        </Card>
      ))}
    </>
  )
}
