import type { Coordinates, Store } from '../../types/models'
import { AppError } from '../../services/errors'
export type LocationFailure =
  'denied' | 'timeout' | 'unavailable' | 'inaccurate' | 'stale' | 'outside' | 'service'
export class LocationError extends AppError {
  readonly reason: LocationFailure
  constructor(reason: LocationFailure, message: string) {
    super('location', message)
    this.reason = reason
  }
}
export function distanceMeters(
  from: Pick<Coordinates, 'latitude' | 'longitude'>,
  to: Pick<Store, 'latitude' | 'longitude'>,
): number {
  const r = Math.PI / 180
  const a =
    Math.sin(((to.latitude - from.latitude) * r) / 2) ** 2 +
    Math.cos(from.latitude * r) *
      Math.cos(to.latitude * r) *
      Math.sin(((to.longitude - from.longitude) * r) / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
}
export function validateLocation(
  location: Coordinates,
  store: Pick<Store, 'latitude' | 'longitude'>,
  radius: number,
  now = Date.now(),
): number {
  if (
    ![location.latitude, location.longitude, location.accuracy, location.capturedAt].every(
      Number.isFinite,
    ) ||
    Math.abs(location.latitude) > 90 ||
    Math.abs(location.longitude) > 180 ||
    location.accuracy < 0
  )
    throw new LocationError('unavailable', 'La ubicación recibida no es válida.')
  if (now - location.capturedAt > 60000 || location.capturedAt > now + 5000)
    throw new LocationError('stale', 'La ubicación ha caducado. Solicita una nueva lectura.')
  if (location.accuracy > Math.min(radius, 100))
    throw new LocationError(
      'inaccurate',
      `Precisión insuficiente (±${Math.round(location.accuracy)} m). Busca un lugar con mejor señal y reintenta.`,
    )
  const distance = distanceMeters(location, store)
  if (distance > radius)
    throw new LocationError(
      'outside',
      `Estás a ${Math.round(distance)} m de la tienda. El radio permitido es ${radius} m.`,
    )
  return distance
}
export function requestLocation(signal?: AbortSignal): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new LocationError('unavailable', 'El navegador no ofrece ubicación.'))
      return
    }
    if (signal?.aborted) {
      reject(new DOMException('Cancelado', 'AbortError'))
      return
    }
    const abort = () => reject(new DOMException('Cancelado', 'AbortError'))
    signal?.addEventListener('abort', abort, { once: true })
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => {
        signal?.removeEventListener('abort', abort)
        if (!signal?.aborted)
          resolve({
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            capturedAt: timestamp,
          })
      },
      (error) => {
        signal?.removeEventListener('abort', abort)
        if (!signal?.aborted)
          reject(
            new LocationError(
              error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable',
              error.code === 1
                ? 'Permiso de ubicación denegado.'
                : error.code === 3
                  ? 'La ubicación tardó demasiado. Reintenta.'
                  : 'GPS no disponible. Revisa la señal.',
            ),
          )
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    )
  })
}
