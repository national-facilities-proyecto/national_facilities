import type { Repositories } from '../repositories/contracts'
import type { Session, Store } from '../../types/models'
import { AppError } from '../errors'
import { API_SESSION_KEY, createHttpClient } from '../http/client'
import { clearNfSession, normalizeRole, validSession } from '../../features/auth/session'
async function pending(): Promise<never> {
  throw new AppError(
    'not_implemented',
    'Esta operación requiere un contrato de API pendiente de integración. Consulta la documentación del frontend.',
  )
}
export function mapStore(value: unknown): Store {
  if (!value || typeof value !== 'object')
    throw new AppError('network', 'Formato de tienda incompatible.')
  const item = value as Record<string, unknown>
  const latitude = Number(item.latitud)
  const longitude = Number(item.longitud)
  if (
    typeof item.id !== 'number' ||
    typeof item.nombre !== 'string' ||
    typeof item.direccion !== 'string' ||
    typeof item.cliente !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  )
    throw new AppError('network', 'Formato de tienda incompatible.')
  return {
    id: item.id,
    name: item.nombre,
    address: item.direccion,
    clientId: item.cliente,
    latitude,
    longitude,
    active: true,
    contact: 'Contacto no disponible',
  }
}
export function createHttpRepositories(apiUrl: string): Repositories {
  const request = createHttpClient(apiUrl)
  return {
    source: 'api',
    auth: {
      async login(input) {
        if (input.kind !== 'credentials')
          throw new AppError('forbidden', 'Las cuentas demo no están disponibles en modo API.')
        const raw = await request('/auth/login/', {
          method: 'POST',
          body: JSON.stringify({ username: input.username, password: input.password }),
        })
        if (!raw || typeof raw !== 'object')
          throw new AppError('network', 'Respuesta de autenticación incompatible.')
        const data = raw as Record<string, unknown>
        if (!data.user || typeof data.user !== 'object')
          throw new AppError(
            'not_implemented',
            'Django entrega tokens, pero falta el contrato de usuario y rol. Se requiere login extendido o /auth/me/ antes de habilitar el portal API.',
          )
        const user = data.user as Record<string, unknown>
        const role = normalizeRole(user.role ?? data.role)
        const session: unknown = {
          access: data.access,
          refresh: data.refresh,
          user: { ...user, role },
          source: 'api',
          expiresAt: data.expiresAt,
        }
        if (!validSession(session))
          throw new AppError(
            'unauthorized',
            'La sesión recibida no contiene usuario, rol y vencimiento válidos.',
          )
        clearNfSession()
        sessionStorage.setItem(API_SESSION_KEY, JSON.stringify(session))
        return session
      },
      async restore() {
        const raw = sessionStorage.getItem(API_SESSION_KEY)
        if (!raw) return null
        let session: unknown
        try {
          session = JSON.parse(raw)
        } catch {
          throw new AppError('unauthorized', 'Sesión no válida.')
        }
        if (!validSession(session) || session.source !== 'api' || session.expiresAt <= Date.now())
          throw new AppError('unauthorized', 'La sesión ha expirado.')
        return session
      },
      async logout() {
        clearNfSession()
      },
      changePassword: pending,
      async demoUsers() {
        return []
      },
    },
    stores: {
      async list(options) {
        const data = await request('/tiendas/', { signal: options?.signal })
        const rows = Array.isArray(data)
          ? data
          : data && typeof data === 'object' && 'results' in data
            ? data.results
            : null
        if (!Array.isArray(rows)) throw new AppError('network', 'Formato de tiendas incompatible.')
        return rows.map(mapStore)
      },
      get: pending,
    },
    checklists: { list: pending, get: pending, claim: pending, saveDraft: pending },
    visits: {
      list: pending,
      get: pending,
      start: pending,
      complete: pending,
      requestException: pending,
      requestTimeException: pending,
      reviewException: pending,
    },
    tickets: { list: pending, get: pending, create: pending, schedule: pending },
    users: { list: pending },
    dashboard: { get: pending },
    administration: { list: pending, save: pending },
    evidence: { put: pending, get: pending, remove: pending },
  }
}
export type ApiLoginContract = Session
