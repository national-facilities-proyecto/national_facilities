import { CalendarDays, ClipboardCheck, ClipboardList, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { ProfileMenu } from '../components/ProfileMenu'
import logo from '../assets/national-facilities-logo.png'
import '../features/technicalSupervisor/technicalSupervisor.css'

export function TechnicalSupervisorLayout({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth > 780)

  return (
    <div className={`ts-shell${open ? ' ts-shell--open' : ''}`}>
      <aside className="ts-sidebar">
        <button className="ts-close" aria-label="Cerrar menú" onClick={() => setOpen(false)}><X /></button>
        <nav>
          <NavLink end to="/technical-supervisor/visits"><CalendarDays size={16} /> Programación de visitas</NavLink>
          <NavLink end to="/technical-supervisor/incidents/completed"><ClipboardCheck size={16} /> Incidencias</NavLink>
          <NavLink end to="/technical-supervisor/checklists"><ClipboardList size={16} /> Checklists</NavLink>
        </nav>
      </aside>
      <div>
        <header className="ts-topbar">
          <button className="ts-menu" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
          <img src={logo} alt="National Facilities" />
          <ProfileMenu onLogout={onLogout} name="Cesar Orejuela" role="Supervisor National" initials="CO" />
        </header>
        <main className="ts-content"><Outlet /></main>
      </div>
    </div>
  )
}
