import type { AdminEntities, AdminKind } from '../../types/models'
import { roleLabels } from '../../types/models'

export const titles: Record<AdminKind, string> = {
  users: 'Usuarios y roles',
  stores: 'Tiendas',
  clients: 'Clientes',
  contracts: 'Contratos',
  templates: 'Plantillas e ítems',
  zones: 'Zonas',
  specialties: 'Especialidades',
  clientSpecialties: 'Especialidades habilitadas por cliente',
}
export type Entity = AdminEntities[AdminKind]
type Field = {
  name: string
  label: string
  type?: 'text' | 'email' | 'number' | 'date' | 'password'
  options?: { value: string; label: string }[]
  optional?: boolean
  inputMode?: 'decimal'
  placeholder?: string
}
export function getAdminFields(
  clients: AdminEntities['clients'][],
  templates: AdminEntities['templates'][],
  zones: AdminEntities['zones'][] = [],
  specialties: AdminEntities['specialties'][] = [],
  clientId?: number,
) {
  const fields: Record<AdminKind, Field[]> = {
    users: [
      { name: 'username', label: 'Usuario de acceso' },
      {
        name: 'password',
        label: 'Contraseña inicial (obligatoria al crear)',
        type: 'password',
        optional: true,
      },
      { name: 'name', label: 'Nombre completo' },
      { name: 'email', label: 'Correo', type: 'email', optional: true },
      {
        name: 'role',
        label: 'Rol',
        options: Object.entries(roleLabels).map(([value, label]) => ({ value, label })),
      },
    ],
    stores: [
      { name: 'name', label: 'Nombre de tienda' },
      { name: 'address', label: 'Dirección' },
      { name: 'contact', label: 'Contacto', optional: true },
      { name: 'latitude', label: 'Latitud', inputMode: 'decimal', placeholder: '-12.127876' },
      { name: 'longitude', label: 'Longitud', inputMode: 'decimal', placeholder: '-76.988939' },
      {
        name: 'clientId',
        label: 'Cliente',
        options: clients.map((client) => ({ value: String(client.id), label: client.name })),
      },
      {
        name: 'zoneId',
        label: 'Zona',
        optional: true,
        options: zones
          .filter((zone) => zone.clientId === clientId)
          .map((zone) => ({ value: String(zone.id), label: zone.name })),
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
      {
        name: 'monthlyInterventions',
        label: 'Intervenciones mínimas mensuales por tienda',
        type: 'number',
      },
      { name: 'radiusMeters', label: 'Radio GPS (metros)', type: 'number' },
    ],
    templates: [
      { name: 'name', label: 'Nombre de plantilla' },
      { name: 'version', label: 'Versión', type: 'number' },
    ],
    zones: [
      {
        name: 'clientId',
        label: 'Cliente',
        options: clients.map((client) => ({ value: String(client.id), label: client.name })),
      },
      { name: 'name', label: 'Nombre de zona' },
    ],
    specialties: [{ name: 'name', label: 'Nombre de especialidad' }],
    clientSpecialties: [
      {
        name: 'clientId',
        label: 'Cliente',
        options: clients.map((client) => ({ value: String(client.id), label: client.name })),
      },
      {
        name: 'categoryId',
        label: 'Especialidad',
        options: specialties.map((specialty) => ({
          value: String(specialty.id),
          label: specialty.name,
        })),
      },
    ],
  }
  return fields
}
