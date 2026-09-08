import { ArrowRight, MapPin, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AssignedLocationsMap } from '../features/technician/AssignedLocationsMap'
import { demoStores } from '../features/technician/data'
import { isVisitCompleted } from '../services/visitService'

export default function ChecklistListPage() {
  const navigate = useNavigate()
  const pendingStores = demoStores.filter((store) => !isVisitCompleted(store.id))
  return <>
    <header className="page-heading"><div><span className="eyebrow">Trabajo preventivo</span><h1>Mis Checklist Pendientes</h1><p className="page-heading__support">Selecciona una visita para revisar sus tareas y comenzar el checklist.</p></div></header>
    {pendingStores.length > 0 && <AssignedLocationsMap stores={pendingStores} onSelect={(store) => navigate(`/checklists/${store.id}`)} />}
    <section className="store-list" aria-label="Checklist pendientes">{pendingStores.map((store) => <article className="store-card" key={store.id}>
      <div className="store-card__top"><div><h2>{store.name}</h2><p className="store-card__address"><MapPin size={15} aria-hidden="true" /> {store.address}</p></div><span className="status-badge status-badge--pending">Pendiente</span></div>
      <dl className="visit-info"><div><dt>Contacto</dt><dd><UserRound size={15} aria-hidden="true" /> {store.contact}</dd></div></dl>
      <div className="store-card__actions"><button className="action-button action-button--primary" onClick={() => navigate(`/checklists/${store.id}`)}>Ver detalle <ArrowRight size={16} aria-hidden="true" /></button></div>
    </article>)}</section>
  </>
}
