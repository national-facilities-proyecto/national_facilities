import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { technicalIncidents } from '../features/technicalSupervisor/data'

const priorityClass = (priority: string) => priority === 'Alta' ? 'high' : priority === 'Media' ? 'medium' : 'low'

export default function TechnicalSupervisorVisitsPage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('')
  const pending = useMemo(() => technicalIncidents.filter((item) => item.status === 'Pendiente' && (!query || `${item.store} ${item.id} ${item.description}`.toLowerCase().includes(query.toLowerCase())) && (!category || item.category === category) && (!priority || item.priority === priority)), [query, category, priority])

  return <section>
    <div className="ts-heading"><span className="eyebrow">Portal supervisor</span><h1>Programación de visitas</h1><p>Revisa las incidencias reportadas por las tiendas y programa su atención técnica.</p></div>
    <div className="ts-panel ts-filters">
      <input placeholder="Buscar tienda o descripción" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Especialidad: todas</option><option>Climatización</option><option>Eléctrico</option><option>Plomería</option><option>Refrigeración</option></select>
      <select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Prioridad: todas</option><option>Alta</option><option>Media</option><option>Baja</option></select>
      <button className="ts-button secondary" onClick={() => { setQuery(''); setCategory(''); setPriority('') }}>Limpiar filtros</button>
    </div>
    <div className="ts-table-wrap"><table className="ts-table"><thead><tr><th>Tienda</th><th>Fecha del reporte</th><th>Especialidad</th><th>Supervisor de tienda</th><th>Prioridad</th><th>Acción</th></tr></thead><tbody>
      {pending.map((item) => <tr key={item.id}><td><strong>{item.store}</strong><small>{item.address}</small><small>{item.id}</small></td><td>{item.reportedAt}</td><td>{item.category}</td><td>{item.supervisor}</td><td><span className={`ts-badge ${priorityClass(item.priority)}`}>{item.priority}</span></td><td><Link className="ts-button" to={`/technical-supervisor/incidents/${item.id}`}>Ver detalle</Link></td></tr>)}
    </tbody></table>{pending.length === 0 && <div className="ts-empty">No hay incidencias pendientes.</div>}</div>
  </section>
}
