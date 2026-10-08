import type { Store, Visit, VisitStatus } from '../../types/models'
import type { MapLocation } from '../technician/mapLocation'

const priority: Record<VisitStatus, number> = {
  in_progress: 0,
  correction_required: 0,
  claimed: 1,
  available: 2,
  pending_approval: 3,
  completed: 4,
  cancelled: 5,
}

function validLocation(store: MapLocation) {
  return (
    Number.isFinite(store.latitude) &&
    Number.isFinite(store.longitude) &&
    Math.abs(store.latitude) <= 90 &&
    Math.abs(store.longitude) <= 180
  )
}

function visitPriority(visit: Visit) {
  // El fin físico y el registro siguen siendo trabajo activo aunque el estado
  // persistido ya sea pendiente_validacion. Una revisión enviada es otra etapa.
  if (
    visit.status === 'pending_approval' &&
    (visit.phase === 'physical_finished' || visit.phase === 'results')
  )
    return 0
  return priority[visit.status]
}

// Ambas colecciones proceden de endpoints autorizados. No ampliamos su alcance
// con búsquedas de tiendas ni derivamos acceso desde el catálogo por sí solo.
export function checklistMapLocations(visits: Visit[], stores: Store[]) {
  const locations = new Map<number, MapLocation>(
    stores.filter(validLocation).map((store) => [store.id, store]),
  )
  const selected = new Map<number, Visit>()
  for (const visit of visits) {
    if (visit.origin !== 'checklist') continue
    const previous = selected.get(visit.storeId)
    // Conserva el orden de la API cuando la prioridad es igual.
    if (!previous || visitPriority(visit) < visitPriority(previous))
      selected.set(visit.storeId, visit)
    if (!locations.has(visit.storeId) && visit.storeSnapshot) {
      const snapshot = { id: visit.storeId, ...visit.storeSnapshot }
      if (validLocation(snapshot)) locations.set(visit.storeId, snapshot)
    }
  }
  return Array.from(selected.values()).flatMap((visit) => {
    const store = locations.get(visit.storeId)
    return store ? [{ store, visit }] : []
  })
}
