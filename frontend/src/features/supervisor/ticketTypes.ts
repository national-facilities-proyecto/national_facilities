export type TicketPriority = 'Alta' | 'Media' | 'Baja'
export type TicketStatus = 'Abierto' | 'En progreso' | 'Completado'

export type TicketEvidence = { id: string; name: string; url: string; type: string }

export type SupervisorTicket = {
  id: string
  category: string
  title: string
  description: string
  priority: TicketPriority
  status: TicketStatus
  store: { name: string; address: string }
  reportedAt: string
  visitDate?: string
  technician?: string
  evidence: TicketEvidence[]
  resolution?: { technician: string; description: string; completedAt: string; evidence: TicketEvidence[]; location?: string }
}
