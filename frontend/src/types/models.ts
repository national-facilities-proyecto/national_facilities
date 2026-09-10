export type UserRole = 'technician' | 'store_supervisor' | 'account_supervisor' | 'administrator'
export const roleLabels: Record<UserRole, string> = {
  technician: 'Técnico de campo',
  store_supervisor: 'Supervisor de tienda',
  account_supervisor: 'Supervisor de cuenta',
  administrator: 'Administrador',
}
export type User = {
  id: number
  name: string
  email: string
  role: UserRole
  storeIds: number[]
  active: boolean
  passwordInitialized: boolean
}
export type Session = {
  user: User
  access: string
  refresh: string
  expiresAt: number
  source: 'mock' | 'api'
}
export type Coordinates = {
  latitude: number
  longitude: number
  accuracy: number
  capturedAt: number
}
export type Store = {
  id: number
  name: string
  address: string
  latitude: number
  longitude: number
  clientId: number
  contact: string
  active: boolean
}
export type ChecklistTask = {
  id: number
  title: string
  photoRequired: boolean
  active: boolean
  order: number
}
export type Evidence = {
  id: string
  taskId?: number
  name: string
  mimeType: string
  size: number
  capturedAt: string
  source: 'camera' | 'upload'
  blob: Blob
}
export type EvidenceMeta = Omit<Evidence, 'blob'>
export type Answer = {
  taskId: number
  result?: 'conforme' | 'no_conforme'
  observation: string
  evidenceIds: string[]
}
export type VisitStatus = 'available' | 'claimed' | 'in_progress' | 'pending_approval' | 'completed'
export type LocationException = {
  reason: string
  failure: string
  requestedAt: string
  reviewedAt?: string
  reviewerId?: number
  approved?: boolean
  reviewReason?: string
}
export type Visit = {
  id: number
  storeId: number
  technicianId?: number
  ticketId?: number
  origin: 'checklist' | 'ticket'
  scheduledAt: string
  status: VisitStatus
  tasks: ChecklistTask[]
  answers: Answer[]
  workDescription: string
  evidenceIds: string[]
  startLocation?: Coordinates
  endLocation?: Coordinates
  startedAt?: string
  completedAt?: string
  exception?: LocationException
  radiusMeters: number
}
export type TicketStatus =
  'open' | 'scheduled' | 'in_progress' | 'pending_approval' | 'resolved' | 'closed'
export const ticketStatusLabels: Record<TicketStatus, string> = {
  open: 'Abierto',
  scheduled: 'Programado',
  in_progress: 'En proceso',
  pending_approval: 'Por aprobar',
  resolved: 'Resuelto',
  closed: 'Cerrado',
}
export const visitStatusLabels: Record<VisitStatus, string> = {
  available: 'Disponible',
  claimed: 'Tomada',
  in_progress: 'En curso',
  pending_approval: 'Por aprobar',
  completed: 'Completado',
}
export type Priority = 'Alta' | 'Media' | 'Baja'
export type TimelineEvent = { id: string; at: string; actorId: number; text: string }
export type Ticket = {
  id: number
  storeId: number
  reporterId: number
  category: string
  priority: Priority
  description: string
  status: TicketStatus
  createdAt: string
  technicianId?: number
  scheduledAt?: string
  resolvedAt?: string
  resolution?: string
  evidenceIds: string[]
  technicalEvidenceIds: string[]
  history: TimelineEvent[]
}
export type Client = { id: number; name: string; taxId: string; email: string }
export type Contract = {
  id: number
  clientId: number
  templateId: number
  startDate: string
  endDate: string
  monthlyVisits: number
  monthlyInterventions: number
  radiusMeters: number
  active: boolean
}
export type Template = {
  id: number
  name: string
  version: number
  active: boolean
  tasks: ChecklistTask[]
}
export type AdminEntities = {
  users: User
  stores: Store
  clients: Client
  contracts: Contract
  templates: Template
}
export type AdminKind = keyof AdminEntities
export type Dashboard = {
  compliance: number | null
  pendingVisits: number
  pendingExceptions: number
  ticketsByStatus: Record<TicketStatus, number>
  averageHours: number | null
  risks: { client: string; completed: number; required: number }[]
}
