import type { AdminEntities, AdminKind } from '../../types/models'
import { roleLabels } from '../../types/models'

export const titles: Record<AdminKind, string> = {
  users: 'Usuarios y roles',
  stores: 'Tiendas',
  clients: 'Clientes',
  contracts: 'Contratos',
  templates: 'Plantillas e ítems',
}
export type Entity = AdminEntities[AdminKind]
type Field = {
  name: string
  label: string
  type?: 'text' | 'email' | 'number' | 'date'
  options?: { value: string; label: string }[]
  optional?: boolean
}
export function getAdminFields(
  clients: AdminEntities['clients'][],
  templates: AdminEntities['templates'][],
) {
  const fields: Record<AdminKind, Field[]> = {
    users: [
      { name: 'name', label: 'Nombre completo' },
      { name: 'email', label: 'Correo', type: 'email' },
      {
        name: 'role',
        label: 'Rol',
        options: Object.entries(roleLabels).map(([value, label]) => ({ value, label })),
      },
    ],
    stores: [
      { name: 'name', label: 'Nombre de tienda' },
      { name: 'address', label: 'Dirección' },
      { name: 'contact', label: 'Contacto' },
      { name: 'latitude', label: 'Latitud', type: 'number' },
      { name: 'longitude', label: 'Longitud', type: 'number' },
      {
        name: 'clientId',
        label: 'Cliente',
        options: clients.map((client) => ({ value: String(client.id), label: client.name })),
      },
    ],
    clients: [
      { name: 'name', label: 'Razón social' },
      { name: 'taxId', label: 'RUC / identificación' },
      { name: 'email', label: 'Correo de contacto', type: 'email' },
    ],
    contracts: [
      {
        name: 'clientId',
        label: 'Cliente',
        options: clients.map((client) => ({ value: String(client.id), label: client.name })),
      },
      {
        name: 'templateId',
        label: 'Plantilla',
        options: templates.map((template) => ({
          value: String(template.id),
          label: template.name,
        })),
      },
      { name: 'startDate', label: 'Fecha de inicio', type: 'date' },
      { name: 'endDate', label: 'Fecha de fin (opcional)', type: 'date', optional: true },
      { name: 'monthlyVisits', label: 'Visitas mensuales', type: 'number' },
      { name: 'monthlyInterventions', label: 'Intervenciones mínimas mensuales', type: 'number' },
      { name: 'radiusMeters', label: 'Radio GPS (metros)', type: 'number' },
    ],
    templates: [
      { name: 'name', label: 'Nombre de plantilla' },
      { name: 'version', label: 'Versión', type: 'number' },
    ],
  }
  return fields
}
