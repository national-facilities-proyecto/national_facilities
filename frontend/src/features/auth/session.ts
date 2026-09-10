import type { Session, UserRole } from '../../types/models'
export const roleHomes: Record<UserRole, string> = {
  technician: '/checklists',
  store_supervisor: '/supervisor/tickets',
  account_supervisor: '/technical-supervisor/visits',
  administrator: '/admin/users',
}
export function normalizeRole(value: unknown): UserRole | null {
  if (typeof value !== 'string') return null
  const roles: Record<string, UserRole> = {
    technician: 'technician',
    tecnico: 'technician',
    store_supervisor: 'store_supervisor',
    'supervisor de tienda': 'store_supervisor',
    account_supervisor: 'account_supervisor',
    'supervisor de cuenta': 'account_supervisor',
    'supervisor tecnico': 'account_supervisor',
    administrator: 'administrator',
    administrador: 'administrator',
  }
  return (
    roles[
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
    ] ?? null
  )
}
export function validSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Partial<Session>
  const user = s.user
  return Boolean(
    typeof s.access === 'string' &&
    s.access.length > 0 &&
    typeof s.refresh === 'string' &&
    s.refresh.length > 0 &&
    typeof s.expiresAt === 'number' &&
    Number.isFinite(s.expiresAt) &&
    (s.source === 'mock' || s.source === 'api') &&
    user &&
    typeof user.id === 'number' &&
    typeof user.name === 'string' &&
    typeof user.email === 'string' &&
    user.active === true &&
    typeof user.passwordInitialized === 'boolean' &&
    normalizeRole(user.role) !== null &&
    normalizeRole(user.role) === user.role &&
    Array.isArray(user.storeIds) &&
    user.storeIds.every((id) => typeof id === 'number'),
  )
}
export function canAccess(session: Session | null, allowed: UserRole[], now = Date.now()): boolean {
  return validSession(session) && session.expiresAt > now && allowed.includes(session.user.role)
}
export function clearNfSession(): void {
  for (const key of [
    'nf_access_token',
    'nf_refresh_token',
    'nf_role',
    'nf_user',
    'nf_data_source',
    'nf:session:mock:v1',
    'nf:session:api:v1',
  ])
    sessionStorage.removeItem(key)
  localStorage.removeItem('nf_password_initialized')
}
