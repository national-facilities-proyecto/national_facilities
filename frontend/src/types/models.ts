export type UserRole = 'technician' | 'store_supervisor' | 'account_supervisor' | 'administrator'
export const roleLabels: Record<UserRole, string> = {
  technician: 'Técnico de campo',
  store_supervisor: 'Supervisor de tienda',
  account_supervisor: 'Supervisor de National Facilities',
  administrator: 'Administrador',
}
export type User = {
  id: number
  username?: string
  password?: string
  name: string
  email: string
  role: UserRole
  storeIds: number[]
  coverages?: Coverage[]
  active: boolean
  passwordInitialized: boolean
}
export type Coverage = { clientId: number; zoneId: number }
export type Zone = { id: number; clientId: number; name: string; active: boolean }
export type Specialty = { id: number; name: string; active: boolean }
export type ClientSpecialty = { id: number; clientId: number; categoryId: number; active: boolean }
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
export type LocationEvidence = Coordinates & {
  distanceMeters: number
  radiusMeters: number
  validated: boolean
}
export type Store = {
  id: number
  name: string
  address: string
  latitude: number
  longitude: number
  clientId: number
  zoneId?: number | null
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
  visitId?: number
  ticketId?: number
  taskId?: number
  name: string
  mimeType: string
  size: number
  capturedAt?: string
  uploadedAt?: string
  source: 'camera' | 'gallery' | 'upload'
  blob: Blob
}
export type EvidenceMeta = Omit<Evidence, 'blob'>
export type Answer = {
  taskId: number
  result?: 'conforme' | 'no_conforme' | 'no_aplica'
  observation: string
  evidenceIds: string[]
}
export type VisitStatus =
  | 'available'
  | 'claimed'
  | 'in_progress'
  | 'pending_approval'
  | 'correction_required'
  | 'completed'
  | 'cancelled'
export type VisitPhase =
  | 'available'
  | 'reserved'
  | 'scheduled'
  | 'physical_work'
  | 'physical_finished'
  | 'results'
  | 'in_review'
  | 'correction_required'
  | 'finished'
  | 'not_performed'
export type ExceptionScope = 'arrival' | 'closure' | 'form' | 'legacy'
export type GpsTelemetry = {
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  capturedAt: number | null
  distanceMeters: number | null
  radiusMeters: number | null
  failure: string
  validated: boolean | null
  legacy?: boolean
}
export type ExceptionInput = {
  type: 'location' | 'time_limit'
  scope: ExceptionScope
  reason: string
  failure?: string
  location?: Coordinates
  revision?: number
}
export const exceptionLabel = (item: Pick<LocationException, 'type' | 'scope'>): string =>
  item.type === 'time_limit'
    ? 'Demora en registro'
    : item.scope === 'arrival'
      ? 'GPS de llegada'
      : item.scope === 'closure'
        ? 'GPS de cierre'
        : 'GPS histórico (etapa no registrada)'
export type LocationException = {
  id?: number
  revision?: number
  authorId?: number
  type: 'location' | 'time_limit'
  scope: ExceptionScope
  telemetry?: GpsTelemetry
  decision?: 'pending' | 'approved' | 'rejected'
  reason: string
  failure: string
  requestedAt?: string
  reviewedAt?: string
  reviewerId?: number
  approved?: boolean
  reviewReason?: string
}
export type ExceptionHistoryEntry = {
  id: string
  at: string
  actorId: number
  kind: 'exception' | 'review' | 'exception_corrected' | 'exception_reopened' | 'exception_previous'
  exception: LocationException
}
export type Visit = {
  id: number
  storeId: number
  storeSnapshot?: Pick<Store, 'name' | 'address' | 'latitude' | 'longitude' | 'clientId'>
  technicianId?: number
  ticketId?: number
  origin: 'checklist' | 'ticket'
  scheduledAt: string
  period?: string
  quota?: number
  quotaCount?: number
  claimedAt?: string
  claimExpiresAt?: string
  claimHistory?: {
    id: string
    at: string
    actorId?: number
    kind: 'claim' | 'claim_release'
    technicianId: number
    claimedAt: string
    expiresAt: string
    text: string
  }[]
  status: VisitStatus
  phase?: VisitPhase
  workStatus?: WorkStatus
  occupiesTechnician?: boolean
  readOnly?: boolean
  gpsExceptionPending?: boolean
  physicalEndedAt?: string
  notPerformedAt?: string
  previousAttemptId?: number
  tasks: ChecklistTask[]
  answers: Answer[]
  workDescription: string
  evidenceIds: string[]
  startLocation?: Partial<Coordinates> & { legacy?: boolean; validated?: boolean | null }
  endLocation?: Partial<Coordinates> & { legacy?: boolean; validated?: boolean | null }
  startedAt?: string
  formOpenedAt?: string
  submittedAt?: string
  revision?: number
  serverNow?: string
  receivedAt?: number
  exceptions?: LocationException[]
  exceptionHistory?: ExceptionHistoryEntry[]
  totalSeconds?: number
  executionSeconds?: number
  registrationSeconds?: number
  legacy?: boolean
  expiresAt?: string
  completedAt?: string
  timeLimitSeconds?: number
  timeLimitExceeded?: boolean
  timeExceptionReason?: string
  timeExceptionStatus?: 'pending' | 'approved' | 'rejected'
  exception?: LocationException
  radiusMeters?: number
}
export function registrationEditable(visit: Visit): boolean {
  return Boolean(
    visit.formOpenedAt &&
    !visit.readOnly &&
    (visit.phase === 'results' || visit.phase === 'correction_required') &&
    visit.status !== 'completed' &&
    visit.status !== 'cancelled',
  )
}
export function operationalVisitLabel(visit: Visit): string {
  if (visit.status === 'pending_approval' && !(visit.phase === 'in_review' && visit.submittedAt))
    return visit.phase === 'physical_work'
      ? 'Trabajo físico en curso'
      : visit.phase === 'physical_finished'
        ? 'Trabajo físico terminado'
        : 'Registro pendiente de envío'
  return visit.phase === 'correction_required'
    ? 'Corrección requerida'
    : visitStatusLabels[visit.status]
}
export type ReviewSubmission = {
  revision: number
  exceptions: ExceptionInput[]
}
export type WorkRecovery = {
  activeExecution?: Visit
  reservations: Visit[]
  corrections: Visit[]
  inReview: Visit[]
}
export type TicketStatus =
  | 'open'
  | 'scheduled'
  | 'in_progress'
  | 'pending_approval'
  | 'correction_required'
  | 'resolved'
  | 'closed'
export type WorkStatus =
  'pending' | 'in_progress' | 'in_review' | 'correction_required' | 'finished' | 'cancelled'
export const workStatusLabels: Record<WorkStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En proceso',
  in_review: 'En revisión',
  correction_required: 'Corrección requerida',
  finished: 'Finalizado',
  cancelled: 'No realizada',
}
export const workStatusOptions: { value: WorkStatus; label: string }[] = [
  { value: 'pending', label: workStatusLabels.pending },
  { value: 'in_progress', label: workStatusLabels.in_progress },
  { value: 'in_review', label: workStatusLabels.in_review },
  { value: 'correction_required', label: workStatusLabels.correction_required },
  { value: 'finished', label: workStatusLabels.finished },
]
const ticketWorkStatuses: Record<TicketStatus, WorkStatus> = {
  open: 'pending',
  scheduled: 'pending',
  in_progress: 'in_progress',
  pending_approval: 'in_review',
  correction_required: 'correction_required',
  resolved: 'finished',
  closed: 'finished',
}
const visitWorkStatuses: Record<VisitStatus, WorkStatus> = {
  available: 'pending',
  claimed: 'pending',
  in_progress: 'in_progress',
  pending_approval: 'in_review',
  correction_required: 'correction_required',
  completed: 'finished',
  cancelled: 'cancelled',
}
export const ticketWorkStatus = (status: TicketStatus): WorkStatus => ticketWorkStatuses[status]
export const visitWorkStatus = (status: VisitStatus): WorkStatus => visitWorkStatuses[status]
export const ticketStatusLabels: Record<TicketStatus, string> = {
  open: workStatusLabels.pending,
  scheduled: workStatusLabels.pending,
  in_progress: workStatusLabels.in_progress,
  pending_approval: workStatusLabels.in_review,
  correction_required: workStatusLabels.correction_required,
  resolved: workStatusLabels.finished,
  closed: workStatusLabels.finished,
}
export const visitStatusLabels: Record<VisitStatus, string> = {
  available: workStatusLabels.pending,
  claimed: workStatusLabels.pending,
  in_progress: workStatusLabels.in_progress,
  pending_approval: workStatusLabels.in_review,
  correction_required: workStatusLabels.correction_required,
  completed: workStatusLabels.finished,
  cancelled: workStatusLabels.cancelled,
}
export type Priority = string
export type ScheduleChange = { technicianId?: number; scheduledAt?: string; priorityId?: number }
export type TimelineEvent = {
  id: string
  at: string
  actorId: number
  text: string
  reason?: string
  previous?: ScheduleChange
  next?: ScheduleChange
}
export type Ticket = {
  id: number
  storeId: number
  reporterId: number
  category: string
  categoryId?: number
  priorityId?: number
  visitId?: number
  revision?: number
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
export type Client = {
  id: number
  name: string
  taxId: string
  email: string
}
export type Catalogs = {
  categories: { id: number; name: string }[]
  priorities: { id: number; name: string; firstResponseHours: number; resolutionHours: number }[]
}
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
  zones: Zone
  specialties: Specialty
  clientSpecialties: ClientSpecialty
}
export type AdminKind = keyof AdminEntities
export type Dashboard = {
  period?: string
  clients?: { id: number; name: string }[]
  compliance: number | null
  pendingVisits: number
  pendingExceptions: number
  ticketsByStatus: Record<TicketStatus, number>
  averageHours: number | null
  risks: {
    storeId: number
    store: string
    clientId: number
    client: string
    completed: number
    required: number
    missing: number
  }[]
}
