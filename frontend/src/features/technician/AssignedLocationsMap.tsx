import { useCallback, useEffect, useState } from 'react'
import { AttributionControl, MapContainer, Marker, Popup, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './map.css'
import type { Store } from '../../types/models'
import { Button } from '../../components/ui'
import { requestLocation } from '../geolocation/location'
import { createOpenFreeMapLayer } from './openFreeMap'
const icon = L.divIcon({
  className: 'nf-marker',
  html: '<span>NF</span>',
  iconSize: [34, 34],
  iconAnchor: [17, 34],
})

function districtFromAddress(address: string) {
  const sections = address
    .split(',')
    .map((section) => section.trim())
    .filter(Boolean)
  return sections.length > 1 ? sections.at(-2) : sections[0]
}
function Bounds({ stores }: { stores: Store[] }) {
  const map = useMap()
  useEffect(() => {
    if (stores.length)
      map.fitBounds(
        stores.map((store) => [store.latitude, store.longitude]),
        { padding: [32, 32], maxZoom: 15 },
      )
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map, stores])
  return null
}
export function OpenFreeMapLayer({
  onReady,
  onError,
  timeoutMs = 12000,
}: {
  onReady(this: void): void
  onError(this: void, message: string): void
  timeoutMs?: number
}) {
  const map = useMap()
  useEffect(() => {
    let layer: L.Layer | undefined
    let failed = false
    const fail = (message: string) => {
      if (failed) return
      failed = true
      onError(message)
    }
    const timer = setTimeout(() => fail('Tiempo de espera agotado al cargar el mapa base.'), timeoutMs)
    void createOpenFreeMapLayer()
      .then((createdLayer) => {
        layer = createdLayer
        layer.once('load', () => {
          clearTimeout(timer)
          if (!failed) onReady()
        })
        layer.once('tileerror', () => {
          clearTimeout(timer)
          fail('No se pudo cargar el mapa base.')
        })
        layer.addTo(map)
      })
      .catch(() => {
        clearTimeout(timer)
        fail('No se pudo inicializar el mapa base.')
      })
    return () => {
      clearTimeout(timer)
      layer?.remove()
    }
  }, [map, onError, onReady, timeoutMs])
  return null
}
export function AssignedLocationsMap({
  stores,
  onSelect,
}: {
  stores: Store[]
  onSelect?: (store: Store) => void
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [position, setPosition] = useState<[number, number]>()
  const [message, setMessage] = useState('')
  const ready = useCallback(() => setState('ready'), [])
  const error = useCallback(() => setState('error'), [])
  if (!stores.length) return null
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
          center={[stores[0].latitude, stores[0].longitude]}
          zoom={13}
          className="nf-map-container"
          attributionControl={false}
          scrollWheelZoom={false}
        >
          <OpenFreeMapLayer key={attempt} onReady={ready} onError={error} />
          <AttributionControl prefix="OpenFreeMap | © OpenStreetMap contributors" />
          <Bounds stores={stores} />
          {stores.map((store) => (
            <Marker key={store.id} position={[store.latitude, store.longitude]} icon={icon}>
              <Tooltip permanent direction="top" offset={[0, -24]} className="nf-map-label">
                <strong>{districtFromAddress(store.address)}</strong>
                <span>{store.name}</span>
              </Tooltip>
              <Popup>
                <strong>{store.name}</strong>
                <p>{store.address}</p>
                {onSelect && <Button onClick={() => onSelect(store)}>Ver tienda</Button>}
              </Popup>
            </Marker>
          ))}
          {position && (
            <Marker position={position} icon={icon}>
              <Popup>Tu ubicación</Popup>
            </Marker>
          )}
        </MapContainer>
        {state !== 'ready' && (
          <div className="nf-map-status" role={state === 'error' ? 'alert' : 'status'}>
            {state === 'loading' ? (
              'Cargando mapa…'
            ) : (
              <>
                <p>Mapa no disponible. Puedes continuar desde la lista de tiendas.</p>
                <Button
                  onClick={() => {
                    setState('loading')
                    setAttempt((value) => value + 1)
                  }}
                >
                  Reintentar mapa
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  )
}
