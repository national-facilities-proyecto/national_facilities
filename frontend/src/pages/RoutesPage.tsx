import { WorkRecovery } from '../features/checklists/WorkRecovery'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useAuth } from '../features/auth/AuthProvider'
import { useQuery } from '../hooks/useQuery'
import { QueryState } from '../components/feedback/QueryState'
import { QueryFeedback } from '../components/feedback/QueryFeedback'
import { Badge, Button, Card, EmptyState, PageHeader } from '../components/ui'
import { dateBucket, scheduleDate } from '../utils/dates'
import { LazyMap } from '../features/technician/LazyMap'
import { checklistMapLocations } from '../features/checklists/checklistMap'
import { operationalVisitLabel } from '../types/models'
export default function RoutesPage() {
  const repos = useRepositories()
  const { session } = useAuth()
  const [filter, setFilter] = useState<'pending' | 'history'>('pending')
  const [today, setToday] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setToday(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])
  const query = useQuery(useCallback((signal) => repos.visits.list({ signal }), [repos]))
  const storeQuery = useQuery(useCallback((signal) => repos.stores.list({ signal }), [repos]))
  const locations = useMemo(() => checklistMapLocations(storeQuery.data ?? []), [storeQuery.data])
  const stores = storeQuery.data ?? []
  const own = (query.data ?? []).filter(
    (visit) => visit.origin === 'ticket' && visit.technicianId === session?.user.id,
  )
  const rows = own
    .filter((visit) =>
      filter === 'history'
        ? visit.status === 'completed'
        : ['claimed', 'in_progress', 'correction_required'].includes(visit.status) ||
          (visit.status === 'pending_approval' && !visit.submittedAt),
    )
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) || a.id - b.id)
  return (
    <>
      <PageHeader
        title="Atenciones"
        description={new Intl.DateTimeFormat('es-PE', {
          dateStyle: 'full',
          timeZone: 'America/Lima',
        }).format(today)}
      />
      <WorkRecovery />
      {storeQuery.status !== 'success' ? (
        <QueryState query={storeQuery} showHeading={false} />
      ) : locations.length ? (
        <LazyMap stores={locations} />
      ) : (
        <section className="nf-card" aria-label="Mapa de tiendas">
          <h2>Ubicaciones asignadas</h2>
          <EmptyState>
            {stores.some((store) => store.active)
              ? 'Tus tiendas asignadas aún no tienen una ubicación disponible.'
              : 'No tienes tiendas asignadas por ahora.'}
          </EmptyState>
        </section>
      )}
      <div className="nf-actions" role="group" aria-label="Filtrar atenciones">
        <Button
          variant="secondary"
          aria-pressed={filter === 'pending'}
          onClick={() => setFilter('pending')}
        >
          Pendientes
        </Button>
        <Button
          variant="secondary"
          aria-pressed={filter === 'history'}
          onClick={() => setFilter('history')}
        >
          Finalizadas
        </Button>
      </div>
      {query.status !== 'success' ? (
        <QueryState query={query} showHeading={false} />
      ) : (
        <>
          <QueryFeedback query={query} />
          <div className="nf-list">
            {!rows.length && (
              <EmptyState>
                {filter === 'pending'
                  ? 'No tienes atenciones pendientes por ahora.'
                  : 'No tienes atenciones finalizadas por ahora.'}
              </EmptyState>
            )}
            {rows.map((visit) => {
              const store = stores.find((item) => item.id === visit.storeId) ?? visit.storeSnapshot
              const bucket = dateBucket(visit.scheduledAt, today)
              return (
                <Card key={visit.id}>
                  <h2>{store?.name ?? 'Atención asignada'}</h2>
                  <div className="nf-ticket-meta">
                    <Badge>{operationalVisitLabel(visit)}</Badge>
                    {filter === 'pending' && visit.phase === 'scheduled' && (
                      <Badge>
                        {bucket === 'late'
                          ? 'Atrasada'
                          : bucket === 'future'
                            ? 'Próxima'
                            : 'Programada para hoy'}
                      </Badge>
                    )}
                  </div>
                  <p>{store?.address}</p>
                  <p>Programada: {scheduleDate(visit.scheduledAt)}</p>
                  <small>Incidencia #{visit.ticketId}</small>
                  <Link className="nf-link" to={`/routes/${visit.id}`}>
                    Ver detalle
                  </Link>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
