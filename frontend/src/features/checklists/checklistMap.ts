import type { Store } from '../../types/models'
import type { MapLocation } from '../technician/mapLocation'

function validLocation(store: MapLocation) {
  return (
    Number.isFinite(store.latitude) &&
    Number.isFinite(store.longitude) &&
    Math.abs(store.latitude) <= 90 &&
    Math.abs(store.longitude) <= 180
  )
}

// El catálogo ya exige cobertura activa exacta cliente + zona en el backend.
// No se incorporan snapshots de visitas continuables fuera de esa cobertura.
export function checklistMapLocations(stores: Store[]): MapLocation[] {
  const locations = new Map<number, MapLocation>(
    stores
      .filter((store) => store.active && validLocation(store))
      .map((store) => [store.id, store]),
  )
  return Array.from(locations.values())
}
