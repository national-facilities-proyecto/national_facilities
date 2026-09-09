export type TechnicalIncident = { id: string; store: string; address: string; category: string; priority: 'Alta' | 'Media' | 'Baja'; description: string; reportedAt: string; supervisor: string; status: 'Pendiente' | 'Programada' | 'Completada'; technician?: string; visitDate?: string; originalPhoto?: string; resolutionPhoto?: string; resolution?: string; location?: string }
export const technicalIncidents: TechnicalIncident[] = [
  { id: 'INC-101', store: 'Tiendas Mass - Los Faisanes', address: 'Av. Los Faisanes, Chorrillos 15054', category: 'Climatización', priority: 'Alta', description: 'Fuga de agua en el sistema de climatización del área de refrigerados.', reportedAt: '2026-08-15', supervisor: 'Carlos Mendoza', status: 'Pendiente' },
  { id: 'INC-102', store: 'Tienda Mass Vargas Machuca', address: 'Av. Ramón Vargas Machuca 340, San Juan de Miraflores 15047', category: 'Eléctrico', priority: 'Media', description: 'Luminarias intermitentes en pasillo 2.', reportedAt: '2026-08-18', supervisor: 'Roberto Sánchez', status: 'Pendiente' },
  { id: 'INC-103', store: 'Tienda Centro - Subterráneo', address: 'Paseo Ahumada 210, Santiago Centro', category: 'Plomería', priority: 'Baja', description: 'Revisión de tubería del baño de clientes.', reportedAt: '2026-08-20', supervisor: 'Ana Torres', status: 'Pendiente' },
  { id: 'INC-104', store: 'Mall Poniente - Bodega C', address: 'Av. Pajaritos 3400, Maipú', category: 'Refrigeración', priority: 'Media', description: 'Vitrina refrigerada no mantiene temperatura.', reportedAt: '2026-08-21', supervisor: 'Luis Pérez', status: 'Pendiente' },
  { id: 'INC-090', store: 'Tiendas Mass - Los Faisanes', address: 'Av. Los Faisanes, Chorrillos 15054', category: 'Climatización', priority: 'Alta', description: 'Equipo de aire acondicionado sin enfriamiento.', reportedAt: '2026-08-15', supervisor: 'Carlos Mendoza', status: 'Completada', technician: 'Juan Pérez', visitDate: '2026-08-20', resolution: 'Se reemplazó la válvula de expansión y se recargó el gas refrigerante.', resolutionPhoto: '/assets/hero.png', location: 'Ubicación validada' },
  { id: 'INC-091', store: 'Tienda Mass Vargas Machuca', address: 'Av. Ramón Vargas Machuca 340, San Juan de Miraflores 15047', category: 'Eléctrico', priority: 'Media', description: 'Luminarias intermitentes en pasillo 2.', reportedAt: '2026-08-12', supervisor: 'Roberto Sánchez', status: 'Completada', technician: 'Ana García', visitDate: '2026-08-19', resolution: 'Se reemplazaron los drivers defectuosos.', resolutionPhoto: '/assets/hero.png', location: 'Ubicación validada' },
]

export const technicalStaff = [{ name: 'Juan Pérez', active: true, assigned: 1 }, { name: 'Ana García', active: true, assigned: 2 }, { name: 'Miguel Torres', active: true, assigned: 0 }]

export function updateTechnicalIncident(id: string, updates: Partial<TechnicalIncident>) {
  const incident = technicalIncidents.find((item) => item.id === id)
  if (incident) Object.assign(incident, updates)
}
