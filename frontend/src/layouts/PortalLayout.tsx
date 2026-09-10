import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useAuth } from '../features/auth/AuthProvider'
import { navigation } from '../app/navigation'
import { ProfileMenu } from '../components/ProfileMenu'
import { Button } from '../components/ui'
import { Modal } from '../components/ui/Modal'
import { ErrorBoundary } from '../components/feedback/ErrorBoundary'
import logo from '../assets/national-facilities-logo.png'
export default function PortalLayout() {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const location = useLocation()
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const resize = () => {
      if (media.matches) setOpen(false)
    }
    media.addEventListener('change', resize)
    return () => media.removeEventListener('change', resize)
  }, [])
  if (!session) return null
  const isTechnician = session.user.role === 'technician'
  const hasCollapsibleSidebar = ['technician', 'store_supervisor', 'administrator'].includes(
    session.user.role,
  )
  const items = navigation[session.user.role]
  const links = items.map((item) => (
    <NavLink key={item.to} to={item.to} end onClick={() => setOpen(false)}>
      {item.label}
    </NavLink>
  ))
  return (
    <div className={`nf-shell ${hasCollapsibleSidebar && !sidebarOpen ? 'nf-shell--sidebar-collapsed' : ''}`}>
      <a className="nf-skip" href="#main-content">
        Saltar al contenido
      </a>
      <aside className={`nf-sidebar ${hasCollapsibleSidebar && !sidebarOpen ? 'nf-sidebar--collapsed' : ''}`}>
        <div className="nf-sidebar__header">
          <p>Portal de mantenimiento</p>
          {hasCollapsibleSidebar && (
            <Button
              variant="secondary"
              className="hidden lg:inline-flex"
              aria-label="Cerrar menú lateral"
              onClick={() => setSidebarOpen(false)}
            >
              <X aria-hidden="true" size={20} />
            </Button>
          )}
        </div>
        <nav aria-label="Navegación principal">{links}</nav>
      </aside>
      <div className="nf-body">
        <header className="nf-topbar">
          <Button
            variant="secondary"
            className="lg:hidden"
            aria-label="Abrir menú"
            onClick={() => setOpen(true)}
          >
            <Menu aria-hidden="true" size={22} />
          </Button>
          {hasCollapsibleSidebar && !sidebarOpen && (
            <Button
              variant="secondary"
              className="hidden lg:inline-flex"
              aria-label="Abrir menú lateral"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu aria-hidden="true" size={22} />
            </Button>
          )}
          <img src={logo} alt="National Facilities" width="180" height="44" />
          <ProfileMenu />
        </header>
        <main id="main-content" tabIndex={-1} className="nf-content">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <Modal open={open} title="Menú de navegación" onClose={() => setOpen(false)}>
        <nav className="nf-drawer" aria-label="Navegación móvil">
          {links}
        </nav>
      </Modal>
      {isTechnician && (
        <nav className="nf-bottom-nav" aria-label="Accesos del técnico">
          {links}
        </nav>
      )}
    </div>
  )
}
