import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ProfileMenu } from '../components/ProfileMenu'
import '../features/technician/technician.css'
import logo from '../assets/national-facilities-logo.png'

export function TechnicianLayout({ onLogout }: { onLogout: () => void }) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth > 780)
  const go = (path: string) => { navigate(path); setMenuOpen(false) }
  return <div className={`portal-shell${menuOpen ? ' portal-shell--menu-open' : ''}`}>
    <aside className={`sidebar${menuOpen ? ' sidebar--open' : ''}`}><button className="sidebar__close" type="button" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}><X size={20} /></button><nav aria-label="Navegación principal"><NavLink className="nav-item" to="/checklists">Mis Checklist</NavLink><NavLink className="nav-item" to="/routes">Mis Rutas</NavLink></nav></aside>
    <div className="portal-shell__body"><header className="topbar"><button className="mobile-menu-toggle" type="button" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button><div className="topbar__mobile-brand"><img className="brand__logo" src={logo} alt="National Facilities" /></div><ProfileMenu onLogout={onLogout} /></header>{menuOpen && <nav className="mobile-menu" aria-label="Menú móvil"><NavLink className="nav-item" onClick={() => setMenuOpen(false)} to="/checklists">Mis Checklist</NavLink><NavLink className="nav-item" onClick={() => setMenuOpen(false)} to="/routes">Mis Rutas</NavLink></nav>}<main className="portal-content"><Outlet /></main></div>
    <nav className="mobile-nav" aria-label="Navegación móvil"><button className="mobile-nav__item" onClick={() => go('/checklists')}>Checklist</button><button className="mobile-nav__item" onClick={() => go('/routes')}>Rutas</button></nav>
  </div>
}
