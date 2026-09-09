export type SupervisorChecklistStatus = 'Pendiente' | 'Por aprobar' | 'Completado'

export type SupervisorChecklist = {
  id: string
  store: string
  address: string
  technician: string
  reportedAt: string
  completedAt?: string
  status: SupervisorChecklistStatus
  gpsValidated: boolean
  gpsJustification?: string
  evidence: { task: string; result: 'Conforme' | 'No conforme'; observation?: string; photo: string }[]
}

export const supervisorChecklists: SupervisorChecklist[] = [
  { id: 'CHK-001', store: 'Tiendas Mass - Los Faisanes', address: 'Av. Los Faisanes, Chorrillos 15054', technician: 'Carlos Mendoza', reportedAt: '2026-08-25', completedAt: '2026-08-25', status: 'Por aprobar', gpsValidated: false, gpsJustification: 'El GPS del dispositivo no obtuvo señal dentro de la tienda.', evidence: [{ task: 'Revisar sistema de climatización', result: 'Conforme', photo: '/assets/hero.png' }, { task: 'Verificar tablero eléctrico', result: 'Conforme', photo: '/assets/hero.png' }] },
  { id: 'CHK-002', store: 'Tienda Mass Vargas Machuca', address: 'Av. Ramón Vargas Machuca 340, San Juan de Miraflores 15047', technician: 'Ana García', reportedAt: '2026-08-24', completedAt: '2026-08-24', status: 'Completado', gpsValidated: true, evidence: [{ task: 'Revisar luminarias', result: 'Conforme', photo: '/assets/hero.png' }] },
  { id: 'CHK-003', store: 'Tienda Centro - Subterráneo', address: 'Paseo Ahumada 210, Santiago Centro', technician: 'Miguel Torres', reportedAt: '2026-08-26', status: 'Pendiente', gpsValidated: false, evidence: [] },
]

export function approveSupervisorChecklist(id: string) {
  const checklist = supervisorChecklists.find((item) => item.id === id)
  if (checklist) checklist.status = 'Completado'
}
