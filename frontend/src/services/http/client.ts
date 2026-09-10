import { AppError } from '../errors'
export const API_SESSION_KEY = 'nf:session:api:v1'
export function createHttpClient(baseUrl: string) {
  return async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    let access: string | undefined
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(API_SESSION_KEY) ?? 'null')
      if (
        typeof saved === 'object' &&
        saved &&
        'access' in saved &&
        typeof saved.access === 'string'
      )
        access = saved.access
    } catch {
      sessionStorage.removeItem(API_SESSION_KEY)
    }
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
          ...init.headers,
        },
      })
      if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event('nf:expired'))
        throw new AppError(
          response.status === 401
            ? 'unauthorized'
            : response.status === 403
              ? 'forbidden'
              : response.status === 404
                ? 'not_found'
                : response.status === 409
                  ? 'conflict'
                  : 'network',
          response.status === 401
            ? 'La sesión expiró o las credenciales no son válidas.'
            : response.status === 403
              ? 'No tienes permiso para esta operación.'
              : response.status === 404
                ? 'Recurso no encontrado.'
                : response.status === 409
                  ? 'El recurso fue modificado por otro usuario. Actualiza la información.'
                  : 'El servicio no pudo completar la solicitud.',
        )
      }
      return response.status === 204 ? undefined : ((await response.json()) as unknown)
    } catch (error) {
      if (
        error instanceof AppError ||
        (error instanceof DOMException && error.name === 'AbortError')
      )
        throw error
      throw new AppError(
        'network',
        'No se pudo conectar con el servicio. Reintenta cuando recuperes la conexión.',
      )
    }
  }
}
