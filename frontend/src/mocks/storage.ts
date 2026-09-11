import { AppError } from '../services/errors'
import { createFixtures, type MockDatabase } from './fixtures'
export const MOCK_KEY = 'nf:mock:v1'
export const SESSION_KEY = 'nf:session:mock:v1'
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const strings = (value: unknown): boolean =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')
function optionalFields(value: Record<string, unknown>, types: Record<string, string>): boolean {
  return Object.entries(types).every(
    ([key, type]) =>
      value[key] === undefined ||
      (typeof value[key] === type && (type !== 'number' || Number.isFinite(value[key]))),
  )
}
function coordinates(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      ['latitude', 'longitude', 'accuracy', 'capturedAt'].every(
        (key) => typeof value[key] === 'number' && Number.isFinite(value[key]),
      ) &&
      Math.abs(Number(value.latitude)) <= 90 &&
      Math.abs(Number(value.longitude)) <= 180 &&
      Number(value.accuracy) >= 0)
  )
}
function exception(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      ['reason', 'failure', 'requestedAt'].every((key) => typeof value[key] === 'string') &&
      optionalFields(value, {
        reviewedAt: 'string',
        reviewerId: 'number',
        approved: 'boolean',
        reviewReason: 'string',
      }))
  )
}
// The fixture shape validates required nested primitives; optional fields are checked below.
function matches(value: unknown, sample: unknown): boolean {
  if (Array.isArray(sample))
    return (
      Array.isArray(value) && (!sample.length || value.every((item) => matches(item, sample[0])))
    )
  if (isRecord(sample))
    return (
      isRecord(value) &&
      Object.entries(sample).every(([key, example]) => matches(value[key], example))
    )
  return typeof value === typeof sample && (typeof value !== 'number' || Number.isFinite(value))
}
export function validateDatabase(value: unknown): value is MockDatabase {
  if (!isRecord(value) || value.version !== 1) return false
  const seed = createFixtures()
  for (const key of [
    'users',
    'stores',
    'clients',
    'contracts',
    'templates',
    'visits',
    'tickets',
  ] as const) {
    if (!Array.isArray(value[key])) return false
  }
  const users = value.users as unknown[]
  if (
    !users.every(
      (user) =>
        matches(user, seed.users[0]) &&
        isRecord(user) &&
        ['technician', 'store_supervisor', 'account_supervisor', 'administrator'].includes(
          String(user.role),
        ) &&
        Array.isArray(user.storeIds) &&
        user.storeIds.every((id) => typeof id === 'number'),
    )
  )
    return false
  if (
    !matches(value.stores, seed.stores) ||
    !matches(value.clients, seed.clients) ||
    !matches(value.contracts, seed.contracts) ||
    !matches(value.templates, seed.templates)
  )
    return false
  const visits = value.visits as unknown[]
  const visitShape = { ...seed.visits[0] }
  delete visitShape.timeLimitSeconds
  delete visitShape.timeLimitExceeded
  if (
    !visits.every(
      (visit) =>
        isRecord(visit) &&
        matches(visit, visitShape) &&
        ['available', 'claimed', 'in_progress', 'pending_approval', 'completed'].includes(
          String(visit.status),
        ) &&
        ['checklist', 'ticket'].includes(String(visit.origin)) &&
        optionalFields(visit, {
          technicianId: 'number',
          ticketId: 'number',
          startedAt: 'string',
          completedAt: 'string',
        }) &&
        coordinates(visit.startLocation) &&
        coordinates(visit.endLocation) &&
        exception(visit.exception) &&
        Array.isArray(visit.answers) &&
        visit.answers.every(
          (answer) =>
            isRecord(answer) &&
            typeof answer.taskId === 'number' &&
            typeof answer.observation === 'string' &&
            Array.isArray(answer.evidenceIds) &&
            answer.evidenceIds.every((id) => typeof id === 'string') &&
            (answer.result === undefined ||
              answer.result === 'conforme' ||
              answer.result === 'no_conforme'),
        ) &&
        Array.isArray(visit.evidenceIds) &&
        visit.evidenceIds.every((id) => typeof id === 'string'),
    )
  )
    return false
  const tickets = value.tickets as unknown[]
  const sample = {
    id: 0,
    storeId: 0,
    reporterId: 0,
    category: '',
    priority: '',
    description: '',
    status: '',
    createdAt: '',
    evidenceIds: [],
    technicalEvidenceIds: [],
    history: [{ id: '', at: '', actorId: 0, text: '' }],
  }
  return tickets.every(
    (ticket) =>
      matches(ticket, sample) &&
      isRecord(ticket) &&
      strings(ticket.evidenceIds) &&
      strings(ticket.technicalEvidenceIds) &&
      optionalFields(ticket, {
        technicianId: 'number',
        scheduledAt: 'string',
        resolvedAt: 'string',
        resolution: 'string',
      }) &&
      ['open', 'scheduled', 'in_progress', 'pending_approval', 'resolved', 'closed'].includes(
        String(ticket.status),
      ) &&
      ['Alta', 'Media', 'Baja'].includes(String(ticket.priority)),
  )
}
export function readDatabase(): MockDatabase {
  try {
    const raw = localStorage.getItem(MOCK_KEY)
    if (!raw) return createFixtures()
    const value: unknown = JSON.parse(raw)
    if (validateDatabase(value)) return value
  } catch {
    throw new AppError(
      'storage',
      'No se pudieron leer los datos demo. Restablécelos desde el panel de demostración.',
    )
  }
  throw new AppError(
    'storage',
    'Los datos demo tienen un formato incompatible. Restablécelos desde el panel de demostración.',
  )
}
export function writeDatabase(db: MockDatabase): void {
  try {
    localStorage.setItem(MOCK_KEY, JSON.stringify(db))
  } catch {
    throw new AppError(
      'storage',
      'No hay espacio para guardar la demostración. Libera espacio o restablece los datos.',
    )
  }
}
