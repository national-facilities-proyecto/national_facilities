import { lazy, Suspense } from 'react'
import type { MapLocation } from './mapLocation'
import { LoadingState } from '../../components/ui'
import { ErrorBoundary } from '../../components/feedback/ErrorBoundary'
const Map = lazy(async () => ({
  default: (await import('./AssignedLocationsMap')).AssignedLocationsMap,
}))
export function LazyMap(props: { stores: MapLocation[]; onSelect?: (store: MapLocation) => void }) {
  if (!props.stores.length) return null
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <section className="nf-card" aria-label="Mapa de tiendas">
            <div className="nf-map-loading-heading">
              <h2>Ubicaciones asignadas</h2>
              <span className="nf-skeleton nf-skeleton--button" aria-hidden="true" />
            </div>
            <LoadingState
              variant="map"
              title="Cargando mapa"
              description="Preparando tus ubicaciones asignadas."
            />
          </section>
        }
      >
        <Map {...props} />
      </Suspense>
    </ErrorBoundary>
  )
}
