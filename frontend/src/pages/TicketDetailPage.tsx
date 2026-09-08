import { ArrowLeft, Camera, FileText, MapPin, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { demoRoutes } from '../features/technician/data'
import { CameraModal } from '../features/technician/CameraModal'
import { getTechnicianLocation } from '../services/technicianLocationStore'
import { completeVisitMock } from '../services/visitService'

export default function TicketDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ticket = demoRoutes.find((item) => item.id === Number(id)) ?? demoRoutes[0]
  const [description, setDescription] = useState('')
  const [evidence, setEvidence] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [status, setStatus] = useState('')
  const complete = async () => { if (!description.trim() || !evidence) { setStatus('Completa la descripción y agrega una fotografía de evidencia.'); return }; const location = getTechnicianLocation(); if (!location) { setStatus('No hay ubicación disponible.'); return }; setStatus('Validando ubicación…'); await completeVisitMock(ticket.id, { coordinates: location, storeCoordinates: ticket.store, answers: [] }); setStatus('Ticket completado (simulación backend).') }

  return <>
    <button className="back-link" onClick={() => navigate('/routes')}><ArrowLeft size={17} aria-hidden="true" /> Volver a mis rutas</button>
    <article className="ticket-detail">
      <header className="ticket-detail__heading">
        <div>
          <span className="eyebrow">Ticket #{ticket.id}</span>
          <h1>{ticket.store.name}</h1>
          <p className="ticket-detail__address"><MapPin size={16} aria-hidden="true" /> {ticket.store.address}</p>
        </div>
        <span className={`priority priority--${ticket.priority.toLowerCase()}`}><TriangleAlert size={15} aria-hidden="true" /> Prioridad {ticket.priority}</span>
      </header>

      <div className="ticket-detail__grid">
        <section className="ticket-detail__reported" aria-labelledby="reported-title">
          <div className="section-heading"><span className="eyebrow">Información reportada</span><h2 id="reported-title">Detalle de la atención</h2></div>
          <dl className="visit-info visit-info--ticket">
            <div><dt>Fecha programada</dt><dd>{ticket.scheduledDate}</dd></div>
            <div><dt>Descripción reportada</dt><dd>{ticket.incident}</dd></div>
            <div><dt>Contacto en tienda</dt><dd>{ticket.store.contact}</dd></div>
          </dl>
        </section>
        <aside className="ticket-reference" aria-labelledby="reference-title">
          <div className="ticket-reference__empty" role="status"><FileText size={26} aria-hidden="true" /><strong id="reference-title">Sin imagen de referencia</strong><p>El supervisor no adjuntó una fotografía para este reporte.</p></div>
        </aside>
      </div>

      <section className="resolution-section" aria-labelledby="resolution-title">
        <div className="section-heading"><span className="eyebrow">Resolución en sitio</span><h2 id="resolution-title">Trabajo realizado y evidencias</h2><p>La descripción del trabajo y las evidencias son obligatorias para completar el ticket.</p></div>
        <div className="resolution-evidence" role="status"><div className="resolution-evidence__icon"><Camera size={20} aria-hidden="true" /></div><div><strong>Evidencias fotográficas</strong><span>No hay fotografías capturadas todavía.</span></div></div>
        <div className="resolution-section__notice" role="status"><strong>Resolución pendiente</strong><span>La captura, validación de ubicación y confirmación se ejecutan desde el flujo de resolución existente.</span></div>
      </section>
      <section className="ticket-resolution-form" aria-label="Resolver ticket">
        <label className="field__label" htmlFor="ticket-resolution">Descripción del trabajo realizado</label>
        <textarea id="ticket-resolution" className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} required rows={5} placeholder="Describe las acciones realizadas en sitio." />
        <button type="button" className="action-button action-button--ghost" onClick={() => setCameraOpen(true)}>{evidence ? 'Repetir evidencia' : 'Tomar fotografía'}</button>
        {evidence && <img className="photo-preview" src={evidence} alt="Evidencia capturada" />}
        {status && <div className="resolution-section__notice" role="status">{status}</div>}
        <button type="button" className="action-button action-button--primary" onClick={() => void complete().catch((error: unknown) => setStatus(error instanceof Error ? error.message : 'No se pudo completar el ticket.'))}>Completar ticket</button>
      </section>
    </article>
    <CameraModal open={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={(photo) => { setEvidence(photo); setCameraOpen(false) }} />
  </>
}
