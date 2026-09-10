import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { QueryState } from '../components/feedback/QueryState'
import { Alert, Badge, Card } from '../components/ui'
import { visitStatusLabels } from '../types/models'
import { LazyMap } from '../features/technician/LazyMap'
import { VisitStart } from '../features/checklists/VisitStart'
export default function ChecklistVisitDetailPage() {
  const { id } = useParams()
  const repos = useRepositories()
  const query = useQuery(
    useCallback(
      async (signal) => {
        const visit = await repos.checklists.get(Number(id), { signal })
        const store = await repos.stores.get(visit.storeId, { signal })
        return { visit, store }
      },
      [id, repos],
    ),
    false,
  )
  if (!query.data || query.status !== 'success') return <QueryState query={query} />
  const { visit, store } = query.data
  return (
    <>
      <Link className="nf-link" to="/checklists">
        ← Mis checklists
      </Link>
      <div className="nf-two-columns">
        <Card>
          <span className="eyebrow">Información de la tienda</span>
          <h1>{store.name}</h1>
          <p>{store.address}</p>
          <Badge>{visitStatusLabels[visit.status]}</Badge>
          <p>Contacto: {store.contact}</p>
          <a
            className="nf-button nf-button--primary nf-directions"
            target="_blank"
            rel="noopener noreferrer"
            href={`https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}`}
          >
            Abrir indicaciones en Google Maps
          </a>
        </Card>
        <LazyMap stores={[store]} />
      </div>
      {visit.status === 'available' && (
        <VisitStart visit={visit} store={store} claimBeforeStart />
      )}
      {visit.status === 'claimed' && <VisitStart visit={visit} store={store} />}
      {visit.status === 'in_progress' && (
        <Link className="nf-link" to={`/checklists/${visit.id}/start`}>
          Continuar checklist
        </Link>
      )}
      {visit.status === 'pending_approval' && (
        <Alert success>Excepción enviada para revisión.</Alert>
      )}
      {visit.status === 'completed' && <Alert success>Checklist completado.</Alert>}
      {visit.exception?.approved === false && (
        <Alert>Excepción rechazada: {visit.exception.reviewReason}</Alert>
      )}
    </>
  )
}
