import technicianEvidence from '../../assets/hero.png'
import type { SupervisorTicket, TicketEvidence, TicketPriority } from './ticketTypes'

const initialTickets: SupervisorTicket[] = [
  { id: 'INC-001', category: 'Climatización', title: 'Aire acondicionado no enfría en área de cajas', description: 'El equipo central dejó de enfriar correctamente.', priority: 'Alta', status: 'En progreso', store: { name: 'MASS - Los Faisanes', address: 'Av. Los Faisanes, Chorrillos 15054' }, reportedAt: '2026-08-24', visitDate: '2026-08-27', technician: 'Carlos Mendoza', evidence: [] },
  { id: 'INC-002', category: 'Eléctrico', title: 'Luminarias intermitentes en pasillo 2', description: 'Se observan cortes intermitentes en las luminarias LED.', priority: 'Media', status: 'Abierto', store: { name: 'MASS - Los Faisanes', address: 'Av. Los Faisanes, Chorrillos 15054' }, reportedAt: '2026-08-25', technician: undefined, evidence: [] },
  { id: 'INC-003', category: 'Plomería', title: 'Fuga de agua en baños de clientes', description: 'Se detectó una fuga en la tubería del baño.', priority: 'Alta', status: 'En progreso', store: { name: 'MASS - Los Faisanes', address: 'Av. Los Faisanes, Chorrillos 15054' }, reportedAt: '2026-08-23', visitDate: '2026-08-26', technician: 'Miguel Torres', evidence: [] },
  { id: 'INC-004', category: 'Refrigeración', title: 'Vitrina refrigerada no mantiene temperatura', description: 'La vitrina presenta variaciones de temperatura.', priority: 'Baja', status: 'Completado', store: { name: 'MASS - Los Faisanes', address: 'Av. Los Faisanes, Chorrillos 15054' }, reportedAt: '2026-08-20', visitDate: '2026-08-22', technician: 'Ana García', evidence: [], resolution: { technician: 'Ana García', description: 'Se calibró el controlador y se verificó la temperatura.', completedAt: '2026-08-22T15:30:00', evidence: [{ id: 'resolution-004', name: 'evidencia-tecnico-inc-004.png', type: 'image/png', url: technicianEvidence }], location: 'Ubicación validada' } },
]

let tickets = [...initialTickets]

export async function getReportedTickets(): Promise<SupervisorTicket[]> { return [...tickets] }
export async function getTicketById(id: string): Promise<SupervisorTicket | undefined> { return tickets.find((ticket) => ticket.id === id) }
export async function createTicket(input: { category: string; priority: TicketPriority; description: string; evidence: TicketEvidence[] }): Promise<SupervisorTicket> {
  const ticket: SupervisorTicket = { id: `INC-${String(tickets.length + 1).padStart(3, '0')}`, category: input.category, title: input.description.slice(0, 58), description: input.description, priority: input.priority, status: 'Abierto', store: { name: 'MASS - Los Faisanes', address: 'Av. Los Faisanes, Chorrillos 15054' }, reportedAt: new Date().toISOString().slice(0, 10), evidence: input.evidence }
  tickets = [ticket, ...tickets]
  return ticket
}
