import { Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useAuth } from '../features/auth/AuthProvider'
import { useInactivityLogout } from '../features/auth/useInactivityLogout'
import { navigation } from '../app/navigation'
import { ProfileMenu } from '../components/ProfileMenu'
import { Button } from '../components/ui'
import { Modal } from '../components/ui/Modal'
import { ErrorBoundary } from '../components/feedback/ErrorBoundary'
import { PageLoadingState } from '../components/feedback/PageLoadingState'
import logo from '../assets/national-facilities-logo.png'
export default function PortalLayout() {
  const { session } = useAuth()
  useInactivityLogout()
  const [open, setOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const sidebar = useRef<HTMLElement>(null)
  const topbar = useRef<HTMLElement>(null)
  const location = useLocation()
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const resize = () => {
      if (media.matches) setOpen(false)
    }
    media.addEventListener('change', resize)
    return () => media.removeEventListener('change', resize)
  }, [])
  useEffect(() => {
    if (sidebar.current) sidebar.current.inert = !sidebarOpen
    if (!sidebarOpen)
      topbar.current?.querySelector<HTMLButtonElement>('[aria-label="Abrir menú lateral"]')?.focus()
  }, [sidebarOpen])
  if (!session) return null
  const items = navigation[session.user.role]
  const links = items.map((item) => (
    <NavLink key={item.to} to={item.to} end onClick={() => setOpen(false)}>
      {item.label}
    </NavLink>
  ))
  return (
    <div className={`nf-shell ${!sidebarOpen ? 'nf-shell--sidebar-collapsed' : ''}`}>
      <a className="nf-skip" href="#main-content">
        Saltar al contenido
      </a>
      <aside
        ref={sidebar}
        id="portal-sidebar"
        aria-hidden={!sidebarOpen}
        className={`nf-sidebar ${!sidebarOpen ? 'nf-sidebar--collapsed' : ''}`}
      >
        <div className="nf-sidebar__header">
          <p>Portal de mantenimiento</p>
          <Button
            variant="secondary"
            className="hidden lg:inline-flex"
            aria-label="Cerrar menú lateral"
            aria-controls="portal-sidebar"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(false)}
          >
            <X aria-hidden="true" size={20} />
          </Button>
        </div>
        <nav aria-label="Navegación principal">{links}</nav>
      </aside>
      <div className="nf-body">
        <header ref={topbar} className="nf-topbar">
          <Button
            variant="secondary"
            className="lg:hidden"
            aria-label="Abrir menú"
            onClick={() => setOpen(true)}
          >
            <Menu aria-hidden="true" size={22} />
          </Button>
          {!sidebarOpen && (
            <Button
              variant="secondary"
              className="hidden lg:inline-flex"
              aria-label="Abrir menú lateral"
              aria-controls="portal-sidebar"
              aria-expanded={sidebarOpen}
              onClick={() => {
                setSidebarOpen(true)
                requestAnimationFrame(() =>
                  sidebar.current
                    ?.querySelector<HTMLButtonElement>('[aria-label="Cerrar menú lateral"]')
                    ?.focus({ preventScroll: true }),
                )
              }}
            >
              <Menu aria-hidden="true" size={22} />
            </Button>
          )}
          <img src={logo} alt="National Facilities" width="180" height="44" />
          <ProfileMenu />
        </header>
        <main id="main-content" tabIndex={-1} className="nf-content">
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageLoadingState />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <Modal
        open={open}
        keepMounted
        className="nf-navigation-modal"
        title="Menú de navegación"
        onClose={() => setOpen(false)}
      >
        <nav className="nf-drawer" aria-label="Navegación móvil">
          {links}
        </nav>
      </Modal>
    </div>
  )
}
