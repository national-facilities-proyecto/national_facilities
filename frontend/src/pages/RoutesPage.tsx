import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { QueryState } from '../components/feedback/QueryState'
import { Badge, Button, Card, EmptyState, PageHeader } from '../components/ui'
import { dateBucket, displayDate } from '../utils/dates'
import { LazyMap } from '../features/technician/LazyMap'
export default function RoutesPage() {
  const repos = useRepositories()
  const [filter, setFilter] = useState<'late' | 'today' | 'future'>('today')
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
  const rows = pending.filter((visit) => dateBucket(visit.scheduledAt, today) === filter)
  return (
    <>
      <PageHeader
        title="Mis rutas pendientes"
        description={new Intl.DateTimeFormat('es-PE', { dateStyle: 'full' }).format(today)}
      />
      <LazyMap
        stores={stores.filter((store) => pending.some((visit) => visit.storeId === store.id))}
      />
      <div className="nf-actions" role="group" aria-label="Filtrar atenciones">
        {(['late', 'today', 'future'] as const).map((value) => (
          <Button
            key={value}
            variant="secondary"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === 'late' ? 'Atrasadas' : value === 'today' ? 'Hoy' : 'Futuras'}
          </Button>
        ))}
      </div>
      <div className="nf-list">
        {!rows.length && <EmptyState>No hay atenciones en este filtro.</EmptyState>}
        {rows.map((visit) => (
          <Card key={visit.id}>
            <Badge>Ticket #{visit.ticketId}</Badge>
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
