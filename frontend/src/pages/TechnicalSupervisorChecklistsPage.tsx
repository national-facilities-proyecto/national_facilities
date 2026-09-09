import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supervisorChecklists } from '../features/technicalSupervisor/checklists'

const statusClass = (status: string) => status === 'Completado' ? 'done' : status === 'Por aprobar' ? 'review' : 'pending'

export default function TechnicalSupervisorChecklistsPage() {
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const results = useMemo(() => supervisorChecklists.filter((item) => (!status || item.status === status) && (!query || `${item.id} ${item.store} ${item.technician}`.toLowerCase().includes(query.toLowerCase()))), [status, query])
  return <section>
    <div className="ts-heading"><span className="eyebrow">Portal supervisor</span><h1>Checklists</h1><p>Supervisa los checklists realizados por los técnicos y valida sus evidencias.</p></div>
    <div className="ts-panel ts-filters ts-checklist-filters"><input placeholder="Buscar tienda, técnico o código" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Estado: todos</option><option>Pendiente</option><option>Por aprobar</option><option>Completado</option></select><button className="ts-button secondary" onClick={() => { setQuery(''); setStatus('') }}>Limpiar filtros</button></div>
    <div className="ts-table-wrap"><table className="ts-table"><thead><tr><th>Checklist</th><th>Tienda</th><th>Técnico</th><th>Fecha</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{results.map((item) => <tr key={item.id}><td><strong>{item.id}</strong></td><td><strong>{item.store}</strong><small>{item.address}</small></td><td>{item.technician}</td><td>{item.completedAt ?? item.reportedAt}</td><td><span className={`ts-badge ${statusClass(item.status)}`}>{item.status}</span></td><td><Link className="ts-button" to={`/technical-supervisor/checklists/${item.id}`}>Ver detalle</Link></td></tr>)}</tbody></table>{results.length === 0 && <div className="ts-empty">No hay checklists con estos filtros.</div>}</div>
  </section>
}
