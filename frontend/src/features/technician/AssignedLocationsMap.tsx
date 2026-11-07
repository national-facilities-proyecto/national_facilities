import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AttributionControl,
  MapContainer,
  Marker,
  Popup,
  Tooltip,
  ZoomControl,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './map.css'
import type { MapLocation } from './mapLocation'
import { Button, LoadingState } from '../../components/ui'
import { requestLocation } from '../geolocation/location'
import { MapBaseLayer } from './MapBaseLayer'
import { openFreeMapProvider } from './mapProviders'
import { toProviderLatLng } from './mapProviderAdapter'
import { LocalGeoJSONLayer } from './LocalGeoJSONLayer'
import { MapFailureBoundary } from './MapFailureBoundary'
import { AssignedLocationsList } from './AssignedLocationsList'
import { LOCAL_ATTRIBUTION, SIMPLIFIED_MESSAGE } from './localPilot'

// Conserva el punto de entrada utilizado por las pruebas y consumidores actuales.
export { MapBaseLayer as OpenFreeMapLayer } from './MapBaseLayer'
const icon = L.divIcon({
  className: 'nf-marker',
  html: '<span aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10V21H21V10M2 10L4 3H20L22 10ZM9 21V14H15V21"/></svg></span>',
  iconSize: [34, 34],
  iconAnchor: [17, 34],
})
const positionIcon = L.divIcon({
  className: 'nf-marker nf-marker--position',
  html: '<span aria-hidden="true"></span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
})

function districtFromAddress(address: string) {
  const sections = address
    .split(',')
    .map((section) => section.trim())
    .filter(Boolean)
  return sections.length > 1 ? sections.at(-2) : sections[0]
}
function StoreLabel({ store }: { store: MapLocation }) {
  const district = districtFromAddress(store.address) ?? ''
  const name = store.name.trim()
  if (!district && !name) return null
  return (
    <Tooltip
      key={JSON.stringify([district, name])}
      permanent
      direction="top"
      offset={[0, -24]}
      className="nf-map-label"
      // Leaflet recibe texto desde la apertura, sin esperar al portal de React.
      content={() => {
        const label = document.createElement('div')
        if (district) {
          const title = document.createElement('strong')
          title.textContent = district
          label.append(title)
        }
        if (name) {
          const title = document.createElement('span')
          title.textContent = name
          label.append(title)
        }
        return label
      }}
    />
  )
}
function Bounds({ stores, position }: { stores: MapLocation[]; position?: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    if (stores.length)
      map.fitBounds(
        [...stores.map((store) => toProviderLatLng(store)!), ...(position ? [position] : [])],
        { padding: [32, 32], maxZoom: 15, animate: false },
      )
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map, stores, position])
  return null
}
export function AssignedLocationsMap({ stores }: { stores: MapLocation[] }) {
  const [state, setState] = useState<
    'loading' | 'ready' | 'local-loading' | 'local-ready' | 'error'
  >('loading')
  const [attempt, setAttempt] = useState(0)
  const [position, setPosition] = useState<[number, number]>()
  const [message, setMessage] = useState('')
  const [mapError, setMapError] = useState('')
  const ready = useCallback(() => setState('ready'), [])
  const loading = useCallback(() => setState('loading'), [])
  const retry = () => {
    setState('loading')
    setMapError('')
    setAttempt((value) => value + 1)
  }
  const error = useCallback(() => setState('local-loading'), [])
  const localReady = useCallback(() => setState('local-ready'), [])
  const localError = useCallback((reason: string) => {
    setMapError(reason)
    setState('error')
  }, [])
  // ACL: solo coordenadas válidas llegan al proveedor de mapas.
  const validStores = useMemo(
    () => stores.filter((store) => toProviderLatLng(store) !== null),
    [stores],
  )
  const locations = useMemo(
    () => [
      ...validStores,
      ...(position ? [{ latitude: position[0], longitude: position[1] }] : []),
    ],
    [validStores, position],
  )
  if (!validStores.length) return null
  return (
    <section className="nf-card" aria-label="Mapa de tiendas">
      <div className="nf-map-heading">
        <h2>Ubicaciones asignadas</h2>
        <Button
          variant="secondary"
          onClick={() => {
            void requestLocation()
              .then((coords) => {
                setPosition([coords.latitude, coords.longitude])
                setMessage(`Ubicación recibida, precisión ±${Math.round(coords.accuracy)} m.`)
              })
              .catch(() =>
                setMessage('No se pudo obtener tu ubicación. Las tiendas siguen disponibles.'),
              )
          }}
        >
          Mi ubicación
        </Button>
      </div>
      <div className="nf-map">
        <MapContainer
          center={toProviderLatLng(validStores[0])!}
          zoom={13}
          className="nf-map-container"
          attributionControl={false}
          scrollWheelZoom={false}
          zoomControl={false}
        >
          {(state === 'loading' || state === 'ready') && (
            <MapBaseLayer key={attempt} onReady={ready} onError={error} onLoading={loading} />
          )}
          {(state === 'local-loading' || state === 'local-ready') && (
            <MapFailureBoundary key={attempt} onError={localError}>
              <LocalGeoJSONLayer locations={locations} onReady={localReady} onError={localError} />
            </MapFailureBoundary>
          )}
          <AttributionControl
            prefix={state === 'local-ready' ? LOCAL_ATTRIBUTION : openFreeMapProvider.attribution}
          />
          <ZoomControl position="bottomright" />
          <Bounds stores={validStores} position={position} />
          {validStores.map((store) => (
            <Marker
              key={store.id}
              position={toProviderLatLng(store)!}
              icon={icon}
              title={store.name}
              eventHandlers={{
                keydown: (event) => {
                  if (
                    ['Enter', ' '].includes(event.originalEvent.key) &&
                    event.target instanceof L.Marker
                  ) {
                    L.DomEvent.stop(event.originalEvent)
                    event.target.openPopup()
                  }
                },
              }}
            >
              <StoreLabel store={store} />
              <Popup
                maxWidth={240}
                autoPanPaddingTopLeft={[20, 20]}
                autoPanPaddingBottomRight={[60, 110]}
              >
                <strong>{store.name}</strong>
                <p>{store.address}</p>
                <a
                  className="nf-link"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}`}
                >
                  Cómo llegar
                </a>
              </Popup>
            </Marker>
          ))}
          {position && (
            <Marker position={position} icon={positionIcon} title="Tu ubicación">
              <Tooltip permanent direction="right" offset={[16, 0]} className="nf-map-label">
                Tu ubicación
              </Tooltip>
              <Popup>Tu ubicación</Popup>
            </Marker>
          )}
        </MapContainer>
        {state !== 'ready' && state !== 'local-ready' && (
          <div className="nf-map-status" role={state === 'error' ? 'alert' : undefined}>
            {state === 'loading' || state === 'local-loading' ? (
              <LoadingState
                variant="map"
                title={
                  state === 'local-loading' ? 'Cargando cartografía simplificada' : 'Cargando mapa'
                }
                description="Puedes continuar desde la lista mientras se carga."
              />
            ) : (
              <>
                <p>Mapa no disponible. Puedes continuar desde la lista de tiendas.</p>
                {mapError && <p>{mapError}</p>}
                <Button onClick={retry}>Reintentar mapa</Button>
              </>
            )}
          </div>
        )}
      </div>
      {state === 'local-ready' && (
        <div role="status" className="nf-map-simplified">
          <p>{SIMPLIFIED_MESSAGE}</p>
          <p>
            Piloto de Lima sur: límites distritales y selección de vías principales. Fuera de esa
            cobertura no hay cartografía de respaldo.
          </p>
          <Button variant="secondary" onClick={retry}>
            Reintentar mapa principal
          </Button>
        </div>
      )}
      {state === 'error' && <AssignedLocationsList stores={stores} />}
      <p className="nf-map-legend">Tiendas: icono de local. Tu ubicación: punto azul.</p>
      {message && <p role="status">{message}</p>}
    </section>
  )
}
