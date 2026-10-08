import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { QueryState } from '../components/feedback/QueryState'
import { Alert, Badge, PageHeader } from '../components/ui'
import { operationalVisitLabel } from '../types/models'
import { LazyMap } from '../features/technician/LazyMap'
import { VisitStart } from '../features/checklists/VisitStart'
import { VisitRecord } from '../features/checklists/VisitRecord'
import { Disclosure } from '../components/ui/Disclosure'
import { VisitStages } from '../features/checklists/VisitStages'
export default function ChecklistVisitDetailPage() {
  const { id } = useParams()
  const repos = useRepositories()
  const query = useQuery(
    useCallback(
      async (signal) => {
        const visit = await repos.checklists.get(Number(id), { signal })
        const store = await repos.stores.get(visit.storeId, { signal })
        return { visit, store: { ...store, ...visit.storeSnapshot } }
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
      <PageHeader title={store.name} description={store.address} />
      <Badge>{operationalVisitLabel(visit)}</Badge>
      {['available', 'claimed'].includes(visit.status) && (
        <>
          <VisitStages current={1} />
          <VisitStart visit={visit} store={store} claimBeforeStart={visit.status === 'available'} />
        </>
      )}
      <Disclosure title="Cómo llegar y contacto">
        <p>{store.contact || 'Sin contacto registrado'}</p>
        <a
          className="nf-button nf-button--secondary nf-directions"
          target="_blank"
          rel="noopener noreferrer"
          href={`https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}`}
        >
          Abrir indicaciones en Google Maps
        </a>
        <LazyMap stores={[store]} />
      </Disclosure>
      {['physical_work', 'physical_finished', 'results', 'correction_required'].includes(
        visit.phase ?? '',
      ) && (
        <Link className="nf-link" to={`/checklists/${visit.id}/start`}>
          {visit.phase === 'correction_required'
            ? 'Corregir registro'
            : !visit.formOpenedAt
              ? 'Retomar ejecución'
              : 'Continuar formulario'}
        </Link>
      )}
      {visit.phase === 'in_review' && visit.submittedAt && (
        <Alert>
          Excepción enviada para revisión.{' '}
          <Link className="nf-link" to={`/checklists/${visit.id}/start`}>
            Ver registro pendiente
          </Link>
        </Alert>
      )}
      {visit.status === 'completed' && (
        <>
          <Alert success>Checklist completado.</Alert>
          <VisitRecord visit={visit} />
        </>
      )}
      {visit.phase === 'not_performed' && (
        <>
          <Alert>No realizado no cuenta como trabajo completado.</Alert>
          <VisitRecord visit={visit} />
        </>
      )}
      {visit.exception?.approved === false && (
        <Alert>Excepción rechazada: {visit.exception.reviewReason}</Alert>
      )}
    </>
  )
}
