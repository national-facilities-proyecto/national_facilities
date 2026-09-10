import type { Session, User, Visit } from '../types/models'
import type { MockScenario, RequestOptions } from '../services/repositories/contracts'
import { AppError } from '../services/errors'
import { validSession } from '../features/auth/session'
import { type MockDatabase } from './fixtures'
import { readDatabase, SESSION_KEY, writeDatabase } from './storage'

export const scenarioState: { value: MockScenario } = { value: 'normal' }
export async function delay(options?: RequestOptions): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (options?.signal?.aborted) {
      reject(new DOMException('Cancelado', 'AbortError'))
      return
    }
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException('Cancelado', 'AbortError'))
    }
    const timer = setTimeout(
      () => {
        options?.signal?.removeEventListener('abort', abort)
        resolve()
      },
      import.meta.env.MODE === 'test' ? 0 : 300,
    )
    options?.signal?.addEventListener('abort', abort, { once: true })
  })
  if (scenarioState.value === 'error_once') {
    scenarioState.value = 'normal'
    throw new AppError('network', 'Error de demostración recuperable. Pulsa Reintentar.')
  }
}
export function sessionFor(user: User): Session {
  return {
    user,
    source: 'mock',
    access: `demo-${user.id}`,
    refresh: `demo-refresh-${user.id}`,
    expiresAt: Date.now() + 3600000,
  }
}
export function saveSession(session: Session): Session {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}
export function currentUser(db = readDatabase()): User {
  let value: unknown
  try {
    value = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')
  } catch {
    throw new AppError('unauthorized', 'La sesión no es válida.')
  }
  if (!validSession(value) || value.source !== 'mock' || value.expiresAt <= Date.now())
    throw new AppError('unauthorized', 'La sesión ha expirado.')
  const user = db.users.find((item) => item.id === value.user.id && item.active)
  if (!user) throw new AppError('unauthorized', 'La sesión ya no está disponible.')
  return user
}
export function allow(user: User, roles: User['role'][]): void {
  if (!roles.includes(user.role))
    throw new AppError('forbidden', 'No tienes acceso a esta operación.')
}
export function visible(user: User, storeId: number): boolean {
  return user.role === 'administrator' || user.storeIds.includes(storeId)
}
export function getVisit(db: MockDatabase, id: number, own = false): Visit {
  const user = currentUser(db)
  const visit = db.visits.find((item) => item.id === id && visible(user, item.storeId))
  if (!visit) throw new AppError('not_found', 'Visita no encontrada.')
  if (own && (user.role !== 'technician' || visit.technicianId !== user.id))
    throw new AppError('forbidden', 'La visita pertenece a otro técnico.')
  return visit
}
export function getTicket(db: MockDatabase, id: number) {
  const user = currentUser(db)
  const ticket = db.tickets.find(
    (item) =>
      item.id === id &&
      visible(user, item.storeId) &&
      (user.role !== 'technician' || item.technicianId === user.id),
  )
  if (!ticket) throw new AppError('not_found', 'Ticket no encontrado.')
  return ticket
}
export async function mutate<T>(work: (db: MockDatabase) => T): Promise<T> {
  await delay()
  const run = () => {
    const db = readDatabase()
    const result = work(db)
    writeDatabase(db)
    window.dispatchEvent(new Event('nf:data'))
    return structuredClone(result)
  }
  return navigator.locks ? navigator.locks.request('nf:mock:write', run) : run()
}
export async function listVisits(origin: Visit['origin'], options?: RequestOptions) {
  await delay(options)
  const db = readDatabase()
  const user = currentUser(db)
  allow(user, ['technician', 'account_supervisor', 'administrator'])
  return scenarioState.value === 'empty'
    ? []
    : db.visits.filter(
        (visit) =>
          visit.origin === origin &&
          visible(user, visit.storeId) &&
          (user.role !== 'technician' ||
            visit.technicianId === user.id ||
            (origin === 'checklist' && visit.status === 'available')),
      )
}
export function finish(db: MockDatabase, visit: Visit, pending: boolean) {
  const now = new Date().toISOString()
  visit.status = pending ? 'pending_approval' : 'completed'
  if (!pending) visit.completedAt = now
  if (visit.ticketId) {
    const ticket = getTicket(db, visit.ticketId)
    ticket.status = pending ? 'pending_approval' : 'resolved'
    ticket.resolution = visit.workDescription
    ticket.technicalEvidenceIds = visit.evidenceIds
    if (!pending) ticket.resolvedAt = now
    ticket.history.push({
      id: crypto.randomUUID(),
      actorId: currentUser(db).id,
      at: now,
      text: pending
        ? 'Resolución enviada para revisión de excepción GPS.'
        : 'Trabajo resuelto con validación de proximidad de demostración.',
    })
  }
}
