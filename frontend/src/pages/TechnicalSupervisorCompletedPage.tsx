import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { technicalIncidents } from '../features/technicalSupervisor/data'

export default function TechnicalSupervisorCompletedPage() {
  const incidents = technicalIncidents.filter((item) => item.status === 'Programada' || item.status === 'Completada')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [technician, setTechnician] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const results = useMemo(() => incidents.filter((item) => (
    (!query || `${item.id} ${item.store} ${item.category}`.toLowerCase().includes(query.toLowerCase())) &&
    (!status || item.status === status) &&
    (!technician || item.technician === technician) &&
    (!from || (item.visitDate ?? item.reportedAt) >= from) &&
    (!to || (item.visitDate ?? item.reportedAt) <= to)
  )), [incidents, query, status, technician, from, to])

  const clear = () => {
    setQuery('')
    setStatus('')
    setTechnician('')
    setFrom('')
    setTo('')
  }

  return (
    <section>
      <div className="ts-heading">
        <span className="eyebrow">Portal supervisor</span>
        <h1>Incidencias</h1>
        <p>Consulta las incidencias programadas y finalizadas de los técnicos.</p>
      </div>

      <div className="ts-panel ts-filters ts-filters--incidents">
        <input placeholder="Buscar tienda, código o especialidad" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Estado: todos</option>
          <option value="Programada">Programadas</option>
          <option value="Completada">Finalizadas</option>
        </select>
        <select value={technician} onChange={(event) => setTechnician(event.target.value)}>
          <option value="">Técnico: todos</option>
          {Array.from(new Set(incidents.map((item) => item.technician).filter(Boolean))).map((name) => <option key={name}>{name}</option>)}
        </select>
        <input type="date" aria-label="Desde" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input type="date" aria-label="Hasta" value={to} onChange={(event) => setTo(event.target.value)} />
        <button className="ts-button secondary" onClick={clear}>Limpiar filtros</button>
      </div>

      <div className="ts-table-wrap">
        <table className="ts-table">
          <thead><tr><th>Tienda</th><th>Fecha del reporte</th><th>Especialidad</th><th>Técnico asignado</th><th>Fecha de visita</th><th>Estado</th><th>Acción</th></tr></thead>
          <tbody>
            {results.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.store}</strong><small>{item.address}</small><small>{item.id}</small></td>
                <td>{item.reportedAt}</td>
                <td>{item.category}</td>
                <td>{item.technician ?? 'Sin asignar'}</td>
                <td>{item.visitDate ?? 'Pendiente'}</td>
                <td><span className={`ts-badge ${item.status === 'Completada' ? 'done' : 'scheduled'}`}>{item.status}</span></td>
                <td><Link className="ts-button" to={`/technical-supervisor/incidents/${item.id}`}>Ver detalle</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {results.length === 0 && <div className="ts-empty">No hay incidencias programadas o finalizadas.</div>}
      </div>
    </section>
  )
}
