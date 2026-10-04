import { AppError } from '../errors'
import { validSession } from '../../features/auth/session'
import type { Session } from '../../types/models'

export const API_SESSION_KEY = 'nf:session:api:v1'
export function savedSession(): Session | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(API_SESSION_KEY) ?? 'null')
    return validSession(value) && value.source === 'api' ? value : null
  } catch {
    return null
  }
}
export function persistSession(session: Session): void {
  sessionStorage.setItem(API_SESSION_KEY, JSON.stringify(session))
  window.dispatchEvent(new Event('nf:session'))
}
function expired(): void {
  sessionStorage.removeItem(API_SESSION_KEY)
  window.dispatchEvent(new Event('nf:expired'))
}
function fieldErrors(value: unknown, prefix = ''): Record<string, string[]> {
  if (typeof value === 'string') return { [prefix || 'detail']: [value] }
  if (Array.isArray(value))
    return { [prefix || 'detail']: value.flatMap((v) => Object.values(fieldErrors(v)).flat()) }
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, v]) =>
        Object.entries(fieldErrors(v, prefix ? prefix + '.' + key : key)),
      ),
    )
  return {}
}
async function failure(response: Response): Promise<AppError> {
  let data: unknown
  try {
    data = await response.json()
  } catch {
    data = null
  }
  const fields = fieldErrors(data)
  const message =
    Object.values(fields).flat().join(' ') || 'El servicio no pudo completar la solicitud.'
  const code =
    response.status === 400
      ? 'validation'
      : response.status === 401
        ? 'unauthorized'
        : response.status === 403
          ? 'forbidden'
          : response.status === 404
            ? 'not_found'
            : response.status === 409
              ? 'conflict'
              : 'network'
  return new AppError(code, message, fields, response.status)
}

let refreshTask: Promise<Session> | undefined
export function createHttpClient(baseUrl: string) {
  const refresh = async (): Promise<Session> => {
    if (refreshTask) return refreshTask
    const current = savedSession()
    if (!current) throw new AppError('unauthorized', 'Vuelve a iniciar sesión.')
    refreshTask = (async () => {
      let response: Response
      try {
        response = await fetch(baseUrl + '/auth/refresh/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: current.refresh }),
        })
      } catch {
        throw new AppError(
          'network',
          'No se pudo renovar la sesión. Reintenta al recuperar la conexión.',
        )
      }
      if (!response.ok) {
        if (response.status === 401) expired()
        throw await failure(response)
      }
      const raw: unknown = await response.json()
      const next: unknown = raw && typeof raw === 'object' ? { ...raw, source: 'api' } : null
      if (!validSession(next)) throw new AppError('network', 'Sesión renovada incompatible.')
      persistSession(next)
      return next
    })()
    try {
      return await refreshTask
    } finally {
      refreshTask = undefined
    }
  }
  const request = async (
    path: string,
    init: RequestInit = {},
    format: 'json' | 'blob' = 'json',
  ): Promise<unknown> => {
    try {
      let session = savedSession()
      const isPublic = ['/auth/login/', '/auth/refresh/'].includes(path)
      if (!isPublic && session && session.expiresAt <= Date.now() + 5000) session = await refresh()
      const send = (access?: string) => {
        const headers = new Headers(init.headers)
        if (!(init.body instanceof FormData) && init.body)
          headers.set('Content-Type', 'application/json')
        if (access && !isPublic) headers.set('Authorization', 'Bearer ' + access)
        return fetch(baseUrl + path, { ...init, headers })
      }
      let response = await send(session?.access)
      if (response.status === 401 && !isPublic && session) {
        session = await refresh()
        response = await send(session.access)
      }
      if (!response.ok) {
        if (response.status === 401 && !isPublic) expired()
        throw await failure(response)
      }
      if (response.status === 204) return undefined
      return format === 'blob' ? await response.blob() : ((await response.json()) as unknown)
    } catch (error) {
      if (
        error instanceof AppError ||
        (error instanceof DOMException && error.name === 'AbortError')
      )
        throw error
      throw new AppError(
        'network',
        'No se pudo conectar con el servicio. Conserva los cambios y reintenta cuando recuperes la conexión.',
      )
    }
  }
  return Object.assign(request, { refresh })
}
