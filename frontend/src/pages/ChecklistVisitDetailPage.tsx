import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { QueryState } from '../components/feedback/QueryState'
import { Alert, Badge, Card } from '../components/ui'
import { operationalVisitLabel } from '../types/models'
import { LazyMap } from '../features/technician/LazyMap'
import { VisitStart } from '../features/checklists/VisitStart'
import { formExpired } from '../features/checklists/clock'
import { VisitRecord } from '../features/checklists/VisitRecord'
import { ClaimHistory } from '../features/checklists/ClaimHistory'
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
      <div className="nf-two-columns">
        <Card>
          <span className="eyebrow">Información de la tienda</span>
          <h1>{store.name}</h1>
          <p>{store.address}</p>
          <Badge>{operationalVisitLabel(visit)}</Badge>
          {visit.quota && (
            <p>
              Visita mensual {visit.quota}
              {visit.quotaCount ? ` de ${visit.quotaCount}` : ''}
            </p>
          )}
          <p>El checklist puede realizarse cualquier día de su mes.</p>
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
      {visit.status === 'available' && <VisitStart visit={visit} store={store} claimBeforeStart />}
      <ClaimHistory visit={visit} />
      {visit.status === 'claimed' && <VisitStart visit={visit} store={store} />}
      {['physical_work', 'physical_finished', 'results', 'correction_required'].includes(
        visit.phase ?? '',
      ) && (
        <Link className="nf-link" to={`/checklists/${visit.id}/start`}>
          {visit.phase === 'correction_required'
            ? 'Corregir registro'
            : !visit.formOpenedAt
              ? 'Retomar ejecución'
              : formExpired(visit)
                ? 'Ver registro pendiente'
                : 'Continuar formulario'}
        </Link>
      )}
      {visit.phase === 'in_review' && visit.submittedAt && (
        <Alert success>
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
