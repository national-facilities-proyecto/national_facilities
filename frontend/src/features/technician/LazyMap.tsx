import { lazy, Suspense } from 'react'
import type { MapLocation } from './mapLocation'
import { LoadingState } from '../../components/ui'
import { MapFailureBoundary } from './MapFailureBoundary'
import { AssignedLocationsList } from './AssignedLocationsList'
const Map = lazy(async () => ({
  default: (await import('./AssignedLocationsMap')).AssignedLocationsMap,
}))
export function LazyMap(props: { stores: MapLocation[] }) {
  if (!props.stores.length) return null
  return (
    <MapFailureBoundary
      fallback={
        <section className="nf-card" aria-label="Tiendas asignadas">
          <p role="alert">No se pudo abrir el visor. Puedes continuar desde la lista de tiendas.</p>
          <AssignedLocationsList stores={props.stores} />
          <button className="nf-button" onClick={() => window.location.reload()}>
            Recargar y reintentar
          </button>
        </section>
      }
    >
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
            <p className="nf-map-legend">Tiendas: icono de local. Tu ubicación: punto azul.</p>
          </section>
        }
      >
        <Map {...props} />
      </Suspense>
    </MapFailureBoundary>
  )
}
