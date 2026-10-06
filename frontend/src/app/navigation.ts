import type { UserRole } from '../types/models'
export const navigation: Record<UserRole, { to: string; label: string }[]> = {
  technician: [
    { to: '/checklists', label: 'Checklists' },
    { to: '/routes', label: 'Atenciones' },
  ],
  store_supervisor: [
    { to: '/supervisor/tickets/new', label: 'Registrar incidencia' },
    { to: '/supervisor/tickets', label: 'Mis incidencias' },
  ],
  account_supervisor: [
    { to: '/technical-supervisor/reports', label: 'Indicadores y reportes' },
    { to: '/technical-supervisor/incidents/completed', label: 'Incidencias' },
    { to: '/technical-supervisor/checklists', label: 'Checklists' },
    { to: '/technical-supervisor/reviews', label: 'Revisiones pendientes' },
  ],
  administrator: [
    { to: '/admin/users', label: 'Usuarios y roles' },
    { to: '/admin/stores', label: 'Tiendas' },
    { to: '/admin/clients', label: 'Clientes' },
    { to: '/admin/zones', label: 'Zonas' },
    { to: '/admin/contracts', label: 'Contratos' },
    { to: '/admin/templates', label: 'Plantillas e ítems' },
    { to: '/admin/specialties', label: 'Especialidades' },
  ],
}
