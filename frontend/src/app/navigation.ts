import type { UserRole } from '../types/models'
export const navigation: Record<UserRole, { to: string; label: string }[]> = {
  technician: [
    { to: '/checklists', label: 'Mis Checklist' },
    { to: '/routes', label: 'Mis Rutas' },
  ],
  store_supervisor: [
    { to: '/supervisor/tickets/new', label: 'Registrar incidencia' },
    { to: '/supervisor/tickets', label: 'Mis incidencias' },
  ],
  account_supervisor: [
    { to: '/technical-supervisor/visits', label: 'Programación de visitas' },
    { to: '/technical-supervisor/incidents/completed', label: 'Incidencias' },
    { to: '/technical-supervisor/checklists', label: 'Checklists' },
  ],
  administrator: [
    { to: '/admin/users', label: 'Usuarios y roles' },
    { to: '/admin/stores', label: 'Tiendas' },
    { to: '/admin/clients', label: 'Clientes' },
    { to: '/admin/contracts', label: 'Contratos' },
    { to: '/admin/templates', label: 'Plantillas e ítems' },
  ],
}
