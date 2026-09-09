import { ClipboardList, Plus, X, Menu } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { ProfileMenu } from '../components/ProfileMenu'
import logo from '../assets/national-facilities-logo.png'
import '../features/supervisor/supervisor.css'

export function SupervisorLayout({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth > 780)
  return <div className={`supervisor-shell${open ? ' supervisor-shell--open' : ''}`}>
    <aside className="supervisor-sidebar"><button className="supervisor-sidebar__close" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X /></button><nav><NavLink end to="/supervisor/tickets/new" onClick={() => setOpen(false)}><Plus size={16} /> Registrar incidencia</NavLink><NavLink end to="/supervisor/tickets" onClick={() => setOpen(false)}><ClipboardList size={16} /> Mis incidencias</NavLink></nav></aside>
    <div className="supervisor-body"><header className="supervisor-topbar"><button className="supervisor-menu" onClick={() => setOpen(!open)} aria-label={open ? 'Cerrar menú' : 'Abrir menú'}>{open ? <X /> : <Menu />}</button><img src={logo} alt="National Facilities" /><ProfileMenu onLogout={onLogout} name="Roberto Sánchez" role="Supervisor de tienda" initials="RS" /></header>{open && <button className="supervisor-overlay" aria-label="Cerrar menú" onClick={() => setOpen(false)} />}
      <main className="supervisor-content"><Outlet /></main>
    </div>
  </div>
}
