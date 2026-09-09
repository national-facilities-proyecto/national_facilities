import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { technicalIncidents, technicalStaff, updateTechnicalIncident } from '../features/technicalSupervisor/data'

export default function TechnicalSupervisorIncidentDetailPage() {
  const { id } = useParams()
  const incident = technicalIncidents.find((item) => item.id === id)
  const [priority, setPriority] = useState(incident?.priority ?? 'Media')
  const [technician, setTechnician] = useState(incident?.technician ?? '')
  const [date, setDate] = useState(incident?.visitDate ?? '')
  const [scheduled, setScheduled] = useState(incident?.status === 'Programada' || incident?.status === 'Completada')
  const [message, setMessage] = useState('')

  if (!incident) {
    return <div className="ts-empty">Incidencia no encontrada.<br /><Link to="/technical-supervisor/visits">Volver</Link></div>
  }

  // Las visitas programadas pertenecen al flujo de programación; las completadas
  // se consultan desde el listado general de incidencias.
  const backToIncidents = incident.status === 'Completada'

  const schedule = () => {
    if (!technician || !date) {
      setMessage('Selecciona un técnico y una fecha.')
      return
    }
    if (date < new Date().toISOString().slice(0, 10)) {
      setMessage('La fecha no puede ser anterior a hoy.')
      return
    }

    updateTechnicalIncident(incident.id, { priority, technician, visitDate: date, status: 'Programada' })
    setScheduled(true)
    setMessage('Visita programada correctamente.')
  }

  return (
    <section>
      <Link className="ts-back" to={backToIncidents ? '/technical-supervisor/incidents/completed' : '/technical-supervisor/visits'}>
        ← {backToIncidents ? 'Incidencias' : 'Programación de visitas'}
      </Link>
      <div className="ts-heading">
        <span className="eyebrow">{incident.id}</span>
        <div className="ts-heading__row">
          <h1>Detalle de la incidencia</h1>
          {scheduled && <span className={`ts-badge ${incident.status === 'Completada' ? 'done' : 'scheduled'}`}>{incident.status}</span>}
        </div>
        <p>{incident.store} · {incident.address}</p>
      </div>

      <div className="ts-detail-grid">
        <article className="ts-panel">
          <h2>Reporte del supervisor de tienda</h2>
          <dl className="ts-detail-list">
            <dt>Fecha del reporte</dt><dd>{incident.reportedAt}</dd>
            <dt>Supervisor</dt><dd>{incident.supervisor}</dd>
            <dt>Especialidad</dt><dd>{incident.category}</dd>
            <dt>Prioridad inicial</dt>
            <dd><span className={`ts-badge ${incident.priority.toLowerCase()}`}>{incident.priority}</span></dd>
            <dt>Descripción</dt><dd>{incident.description}</dd>
          </dl>
          <div className="ts-photo">Foto de la incidencia<br /><small>No registrada</small></div>
        </article>

        <article className="ts-panel ts-schedule-panel">
          <h2>{scheduled ? 'Detalle de la visita' : 'Programación de visita'}</h2>
          {scheduled ? (
            <div className="ts-schedule-summary">
              <span className={`ts-badge ${incident.status === 'Completada' ? 'done' : 'scheduled'}`}>{incident.status}</span>
              <p><strong>Técnico</strong>{technician}</p>
              <p><strong>Fecha de visita</strong>{date}</p>
              <p><strong>Prioridad asignada</strong>{priority}</p>
            </div>
          ) : (
            <>
              <label className="ts-field">
                Nueva prioridad
                <select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}>
                  <option>Alta</option><option>Media</option><option>Baja</option>
                </select>
              </label>
              <label className="ts-field">
                Técnico
                <select value={technician} onChange={(event) => setTechnician(event.target.value)}>
                  <option value="">Seleccionar técnico...</option>
                  {technicalStaff.filter((staff) => staff.active).map((staff) => <option key={staff.name}>{staff.name}</option>)}
                </select>
              </label>
              <label className="ts-field">
                Fecha de visita
                <input type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              <button className="ts-button" onClick={schedule}>Programar visita</button>
              {message && <p className="ts-error">{message}</p>}
            </>
          )}
          {scheduled && message && <p className="ts-success">{message}</p>}
        </article>
      </div>
    </section>
  )
}
