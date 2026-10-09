import { useLocation } from 'react-router-dom'
import { LoadingState } from './LoadingState'
import type { LoadingVariant } from './LoadingState'

function pagePresentation(path: string): { title: string; variant: LoadingVariant } {
  if (path === '/profile/password') return { title: 'Cambiar contraseña', variant: 'form' }
  if (path === '/technical-supervisor/reports')
    return { title: 'Indicadores y reportes', variant: 'dashboard' }
  if (path.startsWith('/admin/')) {
    const titles: Record<string, string> = {
      users: 'Usuarios y roles',
      stores: 'Tiendas',
      clients: 'Clientes',
      contracts: 'Contratos',
      templates: 'Plantillas e ítems',
    }
    return { title: titles[path.split('/')[2]] ?? 'Administración', variant: 'table' }
  }
  if (path === '/supervisor/tickets/new')
    return { title: 'Registrar nueva incidencia', variant: 'form' }
  if (path === '/checklists') return { title: 'Mis Checklist', variant: 'list' }
  if (path === '/routes') return { title: 'Atenciones', variant: 'list' }
  if (path === '/supervisor/tickets') return { title: 'Mis incidencias', variant: 'list' }
  if (path === '/technical-supervisor/visits')
    return { title: 'Programación de visitas', variant: 'list' }
  if (path === '/technical-supervisor/incidents/completed')
    return { title: 'Incidencias', variant: 'list' }
  if (path === '/technical-supervisor/checklists')
    return { title: 'Checklists y excepciones', variant: 'list' }
  if (/^\/checklists\/[^/]+\/start$/.test(path))
    return { title: 'Ejecución del checklist', variant: 'detail' }
  if (path.startsWith('/technical-supervisor/checklists/'))
    return { title: 'Revisión de la intervención', variant: 'detail' }
  return { title: 'Detalle de la intervención', variant: 'detail' }
}

export function PageLoadingState({ showHeading = true }: { showHeading?: boolean }) {
  const { pathname } = useLocation()
  const page = pagePresentation(pathname)
  return (
    <>
      {showHeading && (
        <header className="nf-heading">
          <span className="eyebrow">National Facilities</span>
          <h1>{page.title}</h1>
        </header>
      )}
      <LoadingState
        variant={page.variant}
        title="Preparando tu vista"
        description="La información aparecerá aquí en un momento."
      />
    </>
  )
}
