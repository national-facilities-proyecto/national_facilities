import type {
  User,
  Store,
  Visit,
  Ticket,
  Template,
  Contract,
  Client,
  EvidenceMeta,
  Catalogs,
  LocationException,
  Coordinates,
  Dashboard,
  Zone,
  Specialty,
  ClientSpecialty,
} from '../../types/models'
import { AppError } from '../errors'
import { ticketWorkStatus, visitWorkStatus } from '../../types/models'

function incompatible(): never {
  throw new AppError(
    'network',
    'La API devolvió datos incompatibles. No se sustituyeron por datos locales.',
  )
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return incompatible()
  return Object.fromEntries(Object.entries(value))
}
export function rows(value: unknown): unknown[] {
  if (!Array.isArray(value)) return incompatible()
  return value
}
export function string(value: unknown): string {
  return typeof value === 'string' ? value : incompatible()
}
export function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : incompatible()
}
function integer(value: unknown): number {
  const v = number(value)
  return Number.isInteger(v) && v >= 0 ? v : incompatible()
}
function id(value: unknown): number {
  const v = integer(value)
  return v > 0 ? v : incompatible()
}
function boolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : incompatible()
}
function optional<T>(value: unknown, mapper: (v: unknown) => T): T | undefined {
  return value == null ? undefined : mapper(value)
}
function date(value: unknown): string {
  const v = string(value)
  return Number.isFinite(Date.parse(v)) ? v : incompatible()
}
function choice<const T extends string>(value: unknown, values: readonly T[]): T {
  return values.find((v) => v === value) ?? incompatible()
}
function ids(value: unknown): string[] {
  return rows(value).map(string)
}
function task(value: unknown) {
  const v = object(value)
  return {
    id: id(v.id),
    title: string(v.title),
    photoRequired: boolean(v.photoRequired),
    active: boolean(v.active),
    order: integer(v.order),
  }
}
function coordinates(value: unknown): Coordinates {
  const v = object(value)
  const result = {
    latitude: number(v.latitude),
    longitude: number(v.longitude),
    accuracy: number(v.accuracy),
    capturedAt: number(v.capturedAt),
  }
  if (Math.abs(result.latitude) > 90 || Math.abs(result.longitude) > 180 || result.accuracy < 0)
    incompatible()
  return result
}
export function mapUser(value: unknown): User {
  const v = object(value)
  return {
    id: id(v.id),
    username: string(v.username),
    name: string(v.name),
    email: string(v.email),
    role: choice(v.role, ['technician', 'store_supervisor', 'account_supervisor', 'administrator']),
    storeIds: rows(v.storeIds).map(id),
    coverages:
      v.coverages === undefined
        ? []
        : rows(v.coverages).map((raw) => {
            const row = object(raw)
            return { clientId: id(row.clientId), zoneId: id(row.zoneId) }
          }),
    active: boolean(v.active),
    passwordInitialized: boolean(v.passwordInitialized),
  }
}
export function mapStore(value: unknown): Store {
  const v = object(value)
  const latitude = typeof v.latitude === 'string' ? Number(v.latitude) : number(v.latitude)
  const longitude = typeof v.longitude === 'string' ? Number(v.longitude) : number(v.longitude)
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    incompatible()
  return {
    id: id(v.id),
    name: string(v.name),
    address: string(v.address),
    latitude,
    longitude,
    clientId: id(v.clientId),
    zoneId: optional(v.zoneId, id) ?? null,
    contact: string(v.contact),
    active: boolean(v.active),
  }
}
export function mapZone(value: unknown): Zone {
  const v = object(value)
  return { id: id(v.id), clientId: id(v.clientId), name: string(v.name), active: boolean(v.active) }
}
export function mapSpecialty(value: unknown): Specialty {
  const v = object(value)
  return { id: id(v.id), name: string(v.name), active: boolean(v.active) }
}
export function mapClientSpecialty(value: unknown): ClientSpecialty {
  const v = object(value)
  return {
    id: id(v.id),
    clientId: id(v.clientId),
    categoryId: id(v.categoryId),
    active: boolean(v.active),
  }
}
function exception(value: unknown): LocationException {
  const v = object(value)
  return {
    id: id(v.id),
    type: choice(v.type, ['time_limit', 'location']),
    revision: integer(v.revision),
    authorId: optional(v.authorId, id),
    reason: string(v.reason),
    failure: string(v.failure),
    requestedAt: date(v.requestedAt),
    reviewedAt: optional(v.reviewedAt, date),
    reviewerId: optional(v.reviewerId, id),
    approved: optional(v.approved, boolean),
    reviewReason: string(v.reviewReason),
  }
}
export function mapVisit(value: unknown): Visit {
  const v = object(value)
  const storeSnapshot = optional(v.storeSnapshot, (raw) => {
    const s = object(raw)
    const store = mapStore({ ...s, id: v.storeId, contact: '', active: true })
    return {
      name: store.name,
      address: store.address,
      latitude: store.latitude,
      longitude: store.longitude,
      clientId: store.clientId,
    }
  })
  const legacy = boolean(v.legacy)
  const radius = optional(v.radiusMeters, number)
  if (!legacy && (radius === undefined || radius <= 0)) incompatible()
  const status = choice(v.status, [
    'available',
    'claimed',
    'in_progress',
    'pending_approval',
    'completed',
    'cancelled',
  ])
  if (v.workStatus !== visitWorkStatus(status)) incompatible()
  const quota = optional(v.quota, id)
  const quotaCount = optional(v.quotaCount, id)
  if (quota !== undefined && quotaCount !== undefined && quota > quotaCount) incompatible()
  const claimedAt = optional(v.claimedAt, date)
  const claimExpiresAt = optional(v.claimExpiresAt, date)
  if ((claimedAt === undefined) !== (claimExpiresAt === undefined)) incompatible()
  if (
    claimedAt &&
    claimExpiresAt &&
    (v.origin !== 'checklist' || Date.parse(claimExpiresAt) - Date.parse(claimedAt) !== 7200000)
  )
    incompatible()
  return {
    id: id(v.id),
    storeId: id(v.storeId),
    storeSnapshot,
    technicianId: optional(v.technicianId, id),
    ticketId: optional(v.ticketId, id),
    origin: choice(v.origin, ['checklist', 'ticket']),
    scheduledAt: date(v.scheduledAt),
    period: optional(v.period, date),
    quota,
    quotaCount,
    claimedAt,
    claimExpiresAt,
    claimHistory: rows(v.claimHistory).map((raw) => {
      const entry = object(raw)
      const kind = choice(entry.kind, ['claim', 'claim_release'])
      const actorId = optional(entry.actorId, id)
      if (kind === 'claim' && actorId === undefined) incompatible()
      return {
        id: string(entry.id),
        at: date(entry.at),
        actorId,
        kind,
        technicianId: id(entry.technicianId),
        claimedAt: date(entry.claimedAt),
        expiresAt: date(entry.expiresAt),
        text: string(entry.text),
      }
    }),
    status,
    tasks: rows(v.tasks).map(task),
    answers: rows(v.answers).map((raw) => {
      const a = object(raw)
      return {
        taskId: id(a.taskId),
        result: optional(a.result, (x) => choice(x, ['conforme', 'no_conforme', 'no_aplica'])),
        observation: string(a.observation),
        evidenceIds: ids(a.evidenceIds),
      }
    }),
    workDescription: string(v.workDescription),
    evidenceIds: ids(v.evidenceIds),
    startLocation: optional(v.startLocation, coordinates),
    endLocation: optional(v.endLocation, coordinates),
    startedAt: optional(v.startedAt, date),
    formOpenedAt: optional(v.formOpenedAt, date),
    expiresAt: optional(v.expiresAt, date),
    submittedAt: optional(v.submittedAt, date),
    completedAt: optional(v.completedAt, date),
    revision: integer(v.revision),
    serverNow: date(v.serverNow),
    receivedAt: performance.now(),
    timeLimitSeconds: optional(v.timeLimitSeconds, integer),
    timeLimitExceeded: boolean(v.timeLimitExceeded),
    exceptions: rows(v.exceptions).map(exception),
    exceptionHistory: rows(v.exceptionHistory).map((raw) => {
      const entry = object(raw)
      return {
        id: string(entry.id),
        at: date(entry.at),
        actorId: id(entry.actorId),
        kind: choice(entry.kind, [
          'exception',
          'review',
          'exception_corrected',
          'exception_reopened',
        ]),
        exception: exception(entry.exception),
      }
    }),
    exception: optional(v.exception, exception),
    radiusMeters: radius,
    legacy,
    totalSeconds: optional(v.totalSeconds, number),
    executionSeconds: optional(v.executionSeconds, number),
    registrationSeconds: optional(v.registrationSeconds, number),
  }
}
export function mapTicket(value: unknown): Ticket {
  const v = object(value)
  const status = choice(v.status, [
    'open',
    'scheduled',
    'in_progress',
    'pending_approval',
    'resolved',
    'closed',
  ])
  if (v.workStatus !== ticketWorkStatus(status)) incompatible()
  return {
    id: id(v.id),
    storeId: id(v.storeId),
    reporterId: id(v.reporterId),
    category: string(v.category),
    categoryId: id(v.categoryId),
    priority: string(v.priority),
    priorityId: id(v.priorityId),
    description: string(v.description),
    status,
    createdAt: date(v.createdAt),
    technicianId: optional(v.technicianId, id),
    scheduledAt: optional(v.scheduledAt, date),
    resolvedAt: optional(v.resolvedAt, date),
    resolution: string(v.resolution),
    evidenceIds: ids(v.evidenceIds),
    technicalEvidenceIds: ids(v.technicalEvidenceIds),
    visitId: optional(v.visitId, id),
    revision: integer(v.revision),
    history: rows(v.history).map((raw) => {
      const e = object(raw)
      const details = optional(e.data, object) ?? {}
      const change = (raw: unknown) => {
        const value = object(raw)
        return {
          technicianId: optional(value.technicianId, id),
          scheduledAt: optional(value.scheduledAt, date),
          priorityId: optional(value.priorityId, id),
        }
      }
      return {
        id: string(e.id),
        at: date(e.at),
        actorId: id(e.actorId),
        text: string(e.text),
        reason: optional(details.reason, string),
        previous: optional(details.previous, change),
        next: optional(details.next, change),
      }
    }),
  }
}
export function mapClient(value: unknown): Client {
  const v = object(value)
  return {
    id: id(v.id),
    name: string(v.name),
    taxId: string(v.taxId),
    email: string(v.email),
  }
}
export function mapContract(value: unknown): Contract {
  const v = object(value)
  if (id(v.monthlyInterventions) < 2) incompatible()
  return {
    id: id(v.id),
    clientId: id(v.clientId),
    templateId: id(v.templateId),
    startDate: date(v.startDate),
    endDate: optional(v.endDate, date) ?? '',
    monthlyVisits: id(v.monthlyVisits),
    monthlyInterventions: id(v.monthlyInterventions),
    radiusMeters: id(v.radiusMeters),
    active: boolean(v.active),
  }
}
export function mapTemplate(value: unknown): Template {
  const v = object(value)
  return {
    id: id(v.id),
    name: string(v.name),
    version: id(v.version),
    active: boolean(v.active),
    tasks: rows(v.tasks).map(task),
  }
}
export function mapEvidence(value: unknown): EvidenceMeta {
  const v = object(value)
  return {
    id: string(v.id),
    taskId: optional(v.taskId, id),
    visitId: optional(v.visitId, id),
    ticketId: optional(v.ticketId, id),
    name: string(v.name),
    mimeType: string(v.mimeType),
    size: integer(v.size),
    capturedAt: optional(v.capturedAt, date),
    uploadedAt: date(v.uploadedAt),
    source: choice(v.source, ['camera', 'gallery', 'upload']),
  }
}
export function mapCatalogs(value: unknown): Catalogs {
  const v = object(value)
  return {
    categories: rows(v.categories).map((raw) => {
      const c = object(raw)
      return { id: id(c.id), name: string(c.name) }
    }),
    priorities: rows(v.priorities).map((raw) => {
      const c = object(raw)
      return {
        id: id(c.id),
        name: string(c.name),
        firstResponseHours: number(c.firstResponseHours),
        resolutionHours: number(c.resolutionHours),
      }
    }),
  }
}

export function mapDashboard(value: unknown): Dashboard {
  const v = object(value)
  const statuses = object(v.ticketsByStatus)
  const compliance = v.compliance === null ? null : number(v.compliance)
  const averageHours = v.averageHours === null ? null : number(v.averageHours)
  if (compliance !== null && (compliance < 0 || compliance > 100)) incompatible()
  if (averageHours !== null && averageHours < 0) incompatible()
  return {
    period: date(v.period),
    clients: rows(v.clients).map((raw) => {
      const c = object(raw)
      return { id: id(c.id), name: string(c.name) }
    }),
    compliance,
    pendingVisits: integer(v.pendingVisits),
    pendingExceptions: integer(v.pendingExceptions),
    averageHours,
    ticketsByStatus: {
      open: integer(statuses.open),
      scheduled: integer(statuses.scheduled),
      in_progress: integer(statuses.in_progress),
      pending_approval: integer(statuses.pending_approval),
      resolved: integer(statuses.resolved),
      closed: integer(statuses.closed),
    },
    risks: rows(v.risks).map((raw) => {
      const r = object(raw)
      const completed = integer(r.completed)
      const required = integer(r.required)
      const missing = integer(r.missing)
      if (required < 2 || missing !== Math.max(0, required - completed)) incompatible()
      return {
        storeId: id(r.storeId),
        store: string(r.store),
        clientId: id(r.clientId),
        client: string(r.client),
        completed,
        required,
        missing,
      }
    }),
  }
}
