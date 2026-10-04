import type { Visit } from '../../types/models'

export function serverTime(visit: Visit): number {
  return visit.serverNow && visit.receivedAt !== undefined
    ? Date.parse(visit.serverNow) + performance.now() - visit.receivedAt
    : Date.now()
}

export function formExpired(visit: Visit): boolean {
  return Boolean(visit.expiresAt && serverTime(visit) >= Date.parse(visit.expiresAt))
}
