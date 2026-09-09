import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTicketById } from '../features/supervisor/ticketService'
import type { SupervisorTicket } from '../features/supervisor/ticketTypes'

export default function SupervisorTicketDetailPage() {
  const { id } = useParams()
  const [ticket, setTicket] = useState<SupervisorTicket>()
  useEffect(() => { if (id) getTicketById(id).then(setTicket) }, [id])
  if (!ticket) return <div className="supervisor-empty"><h2>Incidencia no encontrada</h2><Link to="/supervisor/tickets">Volver a mis incidencias</Link></div>
  return <section>
    <Link className="back-link" to="/supervisor/tickets">← Mis incidencias</Link>
    <div className="supervisor-detail-heading"><div><span className="eyebrow">{ticket.id}</span><h1>{ticket.title}</h1><p>{ticket.store.name} · {ticket.store.address}</p></div><div><span className="ticket-status">{ticket.status}</span><span className={`ticket-badge ticket-badge--${ticket.priority.toLowerCase()}`}>{ticket.priority}</span></div></div>
    <div className="detail-grid"><article className="supervisor-panel"><h2>Reporte original</h2><dl><dt>Especialidad</dt><dd>{ticket.category}</dd><dt>Descripción</dt><dd>{ticket.description}</dd><dt>Fecha de reporte</dt><dd>{ticket.reportedAt}</dd><dt>Supervisor</dt><dd>Roberto Sánchez</dd></dl>{ticket.evidence.length > 0 && <div className="evidence-grid">{ticket.evidence.map((file) => <img key={file.id} src={file.url} alt={file.name} />)}</div>}</article><article className="supervisor-panel"><h2>Seguimiento</h2><div className="timeline"><p><b>Reportada</b><span>{ticket.reportedAt}</span></p><p><b>{ticket.technician ? 'Técnico asignado' : 'Pendiente de asignación'}</b><span>{ticket.technician ?? 'Sin asignar'}</span></p>{ticket.visitDate && <p><b>Visita programada</b><span>{ticket.visitDate}</span></p>}</div></article></div>
    <article className="supervisor-panel"><h2>Resolución del técnico</h2>{ticket.resolution ? <><p><b>{ticket.resolution.technician}</b> · {ticket.resolution.completedAt}</p><p>{ticket.resolution.description}</p>{ticket.resolution.evidence.length > 0 && <div className="resolution-evidence"><h3>Evidencia de trabajo</h3><div className="evidence-grid">{ticket.resolution.evidence.map((file) => <img key={file.id} src={file.url} alt={`Evidencia tomada por ${ticket.resolution?.technician}`} />)}</div></div>}<p className="success-note">{ticket.resolution.location ?? 'Validación de ubicación no disponible'}</p></> : <div className="supervisor-empty supervisor-empty--small"><p>La solución técnica estará disponible cuando el trabajo sea completado.</p></div>}</article>
  </section>
}
