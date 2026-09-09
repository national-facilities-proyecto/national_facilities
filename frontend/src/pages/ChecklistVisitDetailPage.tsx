import { ArrowRight, MapPin, Navigation, UserRound } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { AssignedLocationsMap } from '../features/technician/AssignedLocationsMap'
import { demoStores } from '../features/technician/data'

export default function ChecklistVisitDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const store = demoStores.find((item) => item.id === Number(id)) ?? demoStores[0]
  return <section className="checklist-visit-detail">
    <button className="back-link" onClick={() => navigate('/checklists')}>← Mis checklist</button>
    <header className="page-heading"><div><span className="eyebrow">Detalle de visita</span><h1>{store.name}</h1><p className="checklist-store-address"><MapPin size={16} aria-hidden="true" /> {store.address}</p></div></header>
    <div className="checklist-visit-grid">
      <section className="checklist-visit-info"><h2>Información de la tienda</h2><dl className="visit-info"><div><dt>Dirección</dt><dd><MapPin size={15} aria-hidden="true" /> {store.address}</dd></div><div><dt>Encargado</dt><dd><UserRound size={15} aria-hidden="true" /> {store.contact}</dd></div></dl><a className="action-button action-button--ghost checklist-directions" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}`}><Navigation size={16} aria-hidden="true" /> Cómo llegar</a></section>
      <section className="checklist-visit-map"><AssignedLocationsMap stores={[store]} /></section>
    </div>
    <section className="checklist-start-panel"><div><span className="eyebrow">Trabajo preventivo</span><h2>Checklist pendiente</h2><p>Revisa las tareas y registra las evidencias de la visita.</p></div><button className="action-button action-button--primary" onClick={() => navigate(`/checklists/${store.id}/start`)}>Iniciar checklist <ArrowRight size={17} aria-hidden="true" /></button></section>
  </section>
}
