import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getReportedTickets } from '../features/supervisor/ticketService'
import type { SupervisorTicket, TicketStatus } from '../features/supervisor/ticketTypes'

const priorityClass = (priority: string) => `ticket-priority--${priority.toLowerCase()}`
const statusClass = (status: string) => `ticket-status--${status.toLowerCase().replaceAll(' ', '-')}`

export default function SupervisorTicketsPage() {
  const [tickets, setTickets] = useState<SupervisorTicket[]>([])
  const [status, setStatus] = useState<TicketStatus | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  useEffect(() => { getReportedTickets().then(setTickets) }, [])
  const filtered = useMemo(() => tickets.filter((ticket) => (!status || ticket.status === status) && (!from || ticket.reportedAt >= from) && (!to || ticket.reportedAt <= to)), [tickets, status, from, to])
  const clear = () => { setStatus(''); setFrom(''); setTo('') }

  return <section>
    <div className="supervisor-page-heading"><span className="eyebrow">Portal tienda</span><h1>Mis incidencias</h1><p>Gestiona y da seguimiento a las solicitudes de mantenimiento de tu tienda.</p></div>
    <div className="ticket-filters ticket-filters--compact">
      <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value as TicketStatus)}><option value="">Todos</option><option>Abierto</option><option>En progreso</option><option>Completado</option></select></label>
      <label>Fecha inicio<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <span className="filter-separator">—</span>
      <label>Fecha fin<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <button className="button-secondary" onClick={clear}>Limpiar filtros</button>
    </div>
    <p className="ticket-count">{filtered.length} incidencias</p>
    {filtered.length === 0 ? <div className="supervisor-empty"><h2>No hay incidencias</h2><p>No encontramos incidencias con los filtros seleccionados.</p></div> : <div className="ticket-table-wrap"><table className="ticket-table"><thead><tr><th>Incidencia</th><th>Especialidad</th><th>Descripción</th><th>Técnico</th><th>Reportado</th><th>Visita</th><th>Prioridad</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{filtered.map((ticket) => <tr key={ticket.id}><td><strong>{ticket.id}</strong><small>{ticket.store.name}</small></td><td>{ticket.category}</td><td className="ticket-table__description">{ticket.title}</td><td>{ticket.technician ?? 'Sin asignar'}</td><td>{ticket.reportedAt}</td><td>{ticket.visitDate ?? 'Sin asignar'}</td><td><span className={`ticket-badge ${priorityClass(ticket.priority)}`}>{ticket.priority}</span></td><td><span className={`ticket-status ${statusClass(ticket.status)}`}>{ticket.status}</span></td><td><Link className="button-link" to={`/supervisor/tickets/${ticket.id}`}>Ver detalle</Link></td></tr>)}</tbody></table></div>}
  </section>
}
