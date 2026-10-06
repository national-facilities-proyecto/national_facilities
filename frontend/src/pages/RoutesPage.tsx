import { WorkRecovery } from '../features/checklists/WorkRecovery'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { QueryState } from '../components/feedback/QueryState'
import { QueryFeedback } from '../components/feedback/QueryFeedback'
import { Badge, Button, Card, EmptyState, PageHeader } from '../components/ui'
import { dateBucket, displayDate } from '../utils/dates'
import { LazyMap } from '../features/technician/LazyMap'
import { visitStatusLabels } from '../types/models'
export default function RoutesPage() {
  const repos = useRepositories()
  const [filter, setFilter] = useState<'late' | 'today' | 'future' | 'recovery' | 'history'>(
    'today',
  )
  const [today, setToday] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setToday(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])
  const query = useQuery(
    useCallback(
      async (signal) => {
        const [visits, stores] = await Promise.all([
          repos.visits.list({ signal }),
          repos.stores.list({ signal }),
        ])
        return { visits, stores }
      },
      [repos],
    ),
  )
  if (!query.data || query.status !== 'success') return <QueryState query={query} />
  const { stores } = query.data
  const pending = query.data.visits.filter(
    (visit) => !['completed', 'pending_approval'].includes(visit.status),
  )
  const rows =
    filter === 'history'
      ? query.data.visits.filter((visit) => visit.status === 'completed')
      : filter === 'recovery'
        ? query.data.visits.filter(
            (visit) =>
              visit.status === 'in_progress' ||
              visit.status === 'pending_approval' ||
              visit.status === 'correction_required',
          )
        : pending.filter((visit) => dateBucket(visit.scheduledAt, today) === filter)
  return (
    <>
      <PageHeader
        title="Atenciones"
        description={new Intl.DateTimeFormat('es-PE', { dateStyle: 'full' }).format(today)}
      />
      <WorkRecovery />
      <QueryFeedback query={query} />
      <LazyMap
        stores={stores.filter((store) => pending.some((visit) => visit.storeId === store.id))}
      />
      <div className="nf-actions" role="group" aria-label="Filtrar atenciones">
        {(['late', 'today', 'future', 'recovery', 'history'] as const).map((value) => (
          <Button
            key={value}
            variant="secondary"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === 'late'
              ? 'Atrasadas'
              : value === 'today'
                ? 'Hoy'
                : value === 'future'
                  ? 'Futuras'
                  : value === 'recovery'
                    ? 'Recuperar trabajos'
                    : 'Finalizados'}
          </Button>
        ))}
      </div>
      <div className="nf-list">
        {!rows.length && <EmptyState>No hay atenciones en este filtro.</EmptyState>}
        {rows.map((visit) => (
          <Card key={visit.id}>
            <Badge>Atención #{visit.ticketId}</Badge>
            <Badge>{visitStatusLabels[visit.status]}</Badge>
            <h2>{stores.find((store) => store.id === visit.storeId)?.name}</h2>
            <p>{stores.find((store) => store.id === visit.storeId)?.address}</p>
            <p>Programada: {displayDate(visit.scheduledAt)}</p>
            <Link className="nf-link" to={`/routes/${visit.id}`}>
              Ver detalle
            </Link>
          </Card>
        ))}
      </div>
    </>
  )
}
