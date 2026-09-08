export type Store = {
  id: number
  name: string
  address: string
  latitude: number
  longitude: number
  service: string
  contact: string
}

export type ChecklistTask = {
  id: number
  title: string
  photoRequired: boolean
}

export type RouteStatus = 'today' | 'late' | 'future'

export type RouteTicket = {
  id: number
  store: Store
  status: RouteStatus
  priority: 'Alta' | 'Media' | 'Baja'
  incident: string
  scheduledDate: string
}

export const demoStores: Store[] = [
  {
    id: 1,
    name: 'MASS - Los Faisanes',
    address: 'Av. Los Faisanes, Chorrillos 15054',
    latitude: -12.1739,
    longitude: -77.0181,
    service: 'Climatización — Mantenimiento preventivo',
    contact: 'Roberto Sánchez (Supervisor de local)',
  },
  {
    id: 2,
    name: 'MASS - Vargas Machuca',
    address: 'Av. Ramón Vargas Machuca 340, San Juan de Miraflores 15047',
    latitude: -12.1504,
    longitude: -76.9718,
    service: 'Sistema eléctrico — Revisión de tableros',
    contact: 'María Torres (Supervisora de local)',
  },
]

export const checklistTasks: ChecklistTask[] = [
  { id: 1, title: 'Inspección general del equipo climatizador', photoRequired: true },
  { id: 2, title: 'Revisión y limpieza profunda de filtros', photoRequired: true },
  { id: 3, title: 'Verificación de temperatura y presiones del gas', photoRequired: false },
  { id: 4, title: 'Registro fotográfico de entrada y salida', photoRequired: true },
]

export const demoRoutes: RouteTicket[] = [
  {
    id: 101,
    store: demoStores[0],
    status: 'today',
    priority: 'Alta',
    scheduledDate: '26 de agosto de 2026',
    incident:
      'Se requiere realizar el mantenimiento preventivo anual del sistema de climatización en la sede. Incluye inspección general, limpieza de filtros, verificación de presiones y pruebas de funcionamiento.',
  },
  {
    id: 102,
    store: demoStores[1],
    status: 'today',
    priority: 'Media',
    scheduledDate: '26 de agosto de 2026',
    incident: 'Se reportan interrupciones intermitentes en el tablero eléctrico de la tienda.',
  },
  {
    id: 103,
    store: demoStores[0],
    status: 'late',
    priority: 'Alta',
    scheduledDate: '24 de agosto de 2026',
    incident: 'Equipo de aire acondicionado sin enfriamiento suficiente.',
  },
  {
    id: 104,
    store: demoStores[1],
    status: 'future',
    priority: 'Baja',
    scheduledDate: '30 de agosto de 2026',
    incident: 'Revisión preventiva de iluminación interior.',
  },
]

export async function getVisibleStores(): Promise<Store[]> {
  const token = sessionStorage.getItem('nf_access_token')
  if (!token) return demoStores

  const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api').replace(/\/$/, '')

  try {
    const response = await fetch(`${apiBaseUrl}/tiendas/`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) return demoStores
    const stores = (await response.json()) as Array<{
      id: number
      nombre: string
      direccion: string
      latitud: string
      longitud: string
    }>

    if (stores.length === 0) return demoStores

    return stores.map((store) => ({
      id: store.id,
      name: store.nombre,
      address: store.direccion,
      latitude: Number(store.latitud),
      longitude: Number(store.longitud),
      service: 'Mantenimiento preventivo mensual',
      contact: 'Supervisor de tienda',
    }))
  } catch {
    return demoStores
  }
}
