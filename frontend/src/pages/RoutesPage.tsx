import { AlertTriangle, CalendarDays, Clock3, MapPin } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AssignedLocationsMap } from '../features/technician/AssignedLocationsMap'
import { demoRoutes, type RouteStatus } from '../features/technician/data'

const routeFilters: Array<{ id: RouteStatus; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: 'late', label: 'Atrasadas' },
  { id: 'future', label: 'Futuras' },
]

export default function RoutesPage() {
  const [status, setStatus] = useState<RouteStatus>('today')
  const navigate = useNavigate()
  const visibleRoutes = demoRoutes.filter((route) => route.status === status)

  return <>
    <header className="page-heading route-heading">
      <div>
        <span className="eyebrow">Atenciones correctivas</span>
        <h1>Mis rutas pendientes</h1>
        <p className="page-heading__support">Consulta tus atenciones asignadas y registra la resolución en sitio.</p>
      </div>
      <div className="route-heading__date"><CalendarDays size={17} aria-hidden="true" /><span>26 de agosto de 2026</span></div>
    </header>

    <AssignedLocationsMap stores={Array.from(new Map(demoRoutes.map((route) => [route.store.id, route.store])).values())} />

    <section className="routes-section" aria-labelledby="routes-list-title">
      <div className="routes-section__header">
        <div>
          <h2 id="routes-list-title">Atenciones asignadas</h2>
          <p>{visibleRoutes.length} {visibleRoutes.length === 1 ? 'atención disponible' : 'atenciones disponibles'}</p>
        </div>
        <div className="filter-tabs" role="group" aria-label="Filtrar atenciones">
          {routeFilters.map((item) => <button key={item.id} type="button" className={status === item.id ? 'filter-tab filter-tab--active' : 'filter-tab'} aria-pressed={status === item.id} onClick={() => setStatus(item.id)}>{item.label}</button>)}
        </div>
      </div>

      <div className="route-list">
        {visibleRoutes.length === 0 && <div className="empty-state route-empty" role="status"><Clock3 size={24} aria-hidden="true" /><strong>No hay atenciones en este filtro</strong><span>Cuando se asignen nuevas visitas aparecerán aquí.</span></div>}
        {visibleRoutes.map((route) => <article className="route-card" key={route.id}>
          <div className="route-card__main">
            <div className="route-card__title-row"><span className="route-card__ticket">Ticket #{route.id}</span><span className={`priority priority--${route.priority.toLowerCase()}`}><AlertTriangle size={14} aria-hidden="true" /> Prioridad {route.priority}</span></div>
            <h2>{route.store.name}</h2>
            <p className="route-card__address"><MapPin size={15} aria-hidden="true" /> {route.store.address}</p>
          </div>
          <dl className="route-card__details">
            <div><dt>Tipo de atención</dt><dd>{route.store.service}</dd></div>
            <div><dt>Programada</dt><dd>{route.scheduledDate}</dd></div>
          </dl>
          <button className="action-button action-button--primary route-card__action" onClick={() => navigate(`/routes/${route.id}`)}>Ver detalle</button>
        </article>)}
      </div>
    </section>
  </>
}
