import { useCallback, useEffect, useMemo, useState } from 'react'
import { AttributionControl, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'
import { setWorkerUrl, type Map as MaplibreMap } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Store } from './data'
import { setTechnicianLocation, useTechnicianLocation } from '../../services/technicianLocationStore'

try {
  if (typeof setWorkerUrl === 'function' && workerUrl) {
    setWorkerUrl(workerUrl)
  }
} catch {
  // Ignored in non-browser or test environments
}

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const FALLBACK_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const FALLBACK_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const storeIcon = L.divIcon({ className: 'nf-marker', html: '<span>NF</span>', iconSize: [34, 34], iconAnchor: [17, 34] })
const technicianIcon = L.divIcon({ className: 'nf-marker nf-marker--technician', html: '<span>Yo</span>', iconSize: [34, 34], iconAnchor: [17, 34] })

function Bounds({ stores, position }: { stores: Store[]; position: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    const points = stores.map((store) => [store.latitude, store.longitude] as [number, number])
    if (position) points.push(position)
    if (points.length && typeof map?.fitBounds === 'function') map.fitBounds(points, { padding: [32, 32], maxZoom: 14 })
  }, [map, position, stores])
  return null
}

function MapViewportReady() {
  const map = useMap()
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (typeof map?.invalidateSize === 'function') map.invalidateSize()
    })
    return () => cancelAnimationFrame(frame)
  }, [map])
  return null
}

export function OpenFreeMapLayer({
  onReady,
  onError,
  timeoutMs = 12_000,
}: {
  onReady: () => void
  onError: (message: string) => void
  timeoutMs?: number
}) {
  const map = useMap()
  useEffect(() => {
    let layer: ReturnType<typeof maplibreGL> | null = null
    let maplibreMap: MaplibreMap | null = null
    let disposed = false
    let timer: number | undefined
    let resizeFrame: number | undefined

    try {
      layer = maplibreGL({
        style: OPENFREEMAP_STYLE,
        minZoom: 1,
      })
      layer.addTo(map)
      maplibreMap = layer.getMaplibreMap()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo inicializar el mapa WebGL.')
      return
    }

    if (!maplibreMap) {
      onError('No se pudo inicializar la capa MapLibre.')
      return
    }

    const resize = () => {
      if (disposed) return
      if (typeof map?.invalidateSize === 'function') {
        map.invalidateSize({ pan: false })
      }
      const leafletContainer = typeof map?.getContainer === 'function' ? map.getContainer() : null
      const maplibreContainer = typeof maplibreMap?.getContainer === 'function' ? maplibreMap.getContainer() : null
      if (!maplibreContainer) return

      const canvas = maplibreContainer.querySelector('canvas')
      const width = maplibreContainer.clientWidth || leafletContainer?.clientWidth || 0
      const height = maplibreContainer.clientHeight || leafletContainer?.clientHeight || 0
      if (width > 0 && height > 0) {
        maplibreMap.resize?.()
        maplibreMap.triggerRepaint?.()
      }
      if (canvas) {
        canvas.style.width = '100%'
        canvas.style.height = '100%'
      }
    }

    const scheduleResize = () => {
      if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = undefined
        resize()
      })
    }
    scheduleResize()

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleResize)
    const leafletEl = typeof map?.getContainer === 'function' ? map.getContainer() : null
    const maplibreEl = typeof maplibreMap?.getContainer === 'function' ? maplibreMap.getContainer() : null
    if (leafletEl) observer?.observe(leafletEl)
    if (maplibreEl) observer?.observe(maplibreEl)

    const markReady = () => {
      if (disposed) return
      if (timer !== undefined) window.clearTimeout(timer)
      scheduleResize()
      onReady()
    }

    const handleError = (event: { error?: { message?: string } }) => {
      const isLoaded = Boolean(maplibreMap.loaded?.() || maplibreMap.isStyleLoaded?.())
      if (!isLoaded) {
        onError(event.error?.message ?? 'No se pudo renderizar el mapa base.')
      }
    }

    const isReady = () => Boolean(maplibreMap.loaded?.() || maplibreMap.isStyleLoaded?.())
    if (isReady()) {
      markReady()
    } else {
      maplibreMap.once?.('load', markReady)
      maplibreMap.once?.('idle', markReady)
      maplibreMap.on?.('error', handleError)
      timer = window.setTimeout(() => {
        if (!disposed && !isReady()) {
          onError('Tiempo de espera agotado al cargar el mapa base.')
        }
      }, timeoutMs)
      if (isReady()) markReady()
    }

    return () => {
      disposed = true
      if (timer !== undefined) window.clearTimeout(timer)
      if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
      observer?.disconnect()
      maplibreMap?.off?.('load', markReady)
      maplibreMap?.off?.('idle', markReady)
      maplibreMap?.off?.('error', handleError)
      try {
        layer?.remove()
      } catch {
        // Safe cleanup
      }
    }
  }, [map, onError, onReady, timeoutMs])

  return null
}

export function AssignedLocationsMap({ stores, onSelect }: { stores: Store[]; onSelect?: (store: Store) => void }) {
  const technicianLocation = useTechnicianLocation()
  const position = useMemo<[number, number] | null>(() => technicianLocation ? [technicianLocation.latitude, technicianLocation.longitude] : null, [technicianLocation])
  // Keep overlapping store and technician markers discoverable in the demo.
  const technicianDisplayPosition = useMemo<[number, number] | null>(() => {
    if (!position) return null
    const overlapsStore = stores.some((store) => Math.abs(store.latitude - position[0]) < 0.00035 && Math.abs(store.longitude - position[1]) < 0.00035)
    return overlapsStore ? [position[0] + 0.00028, position[1] + 0.00028] : position
  }, [position, stores])
  const setPosition = (nextPosition: [number, number]) => setTechnicianLocation({ latitude: nextPosition[0], longitude: nextPosition[1], accuracy: technicianLocation?.accuracy })
  const [message, setMessage] = useState('')
  const [baseLayerReady, setBaseLayerReady] = useState(false)
  const [baseLayerError, setBaseLayerError] = useState('')
  const [useFallback, setUseFallback] = useState(false)
  const [mapAttempt, setMapAttempt] = useState(0)
  const center = useMemo<[number, number]>(() => [stores[0]?.latitude ?? -12.14, stores[0]?.longitude ?? -77.02], [stores])

  const locate = () => {
    if (!navigator.geolocation) { setMessage('Tu navegador no admite ubicación.'); return }
    navigator.geolocation.getCurrentPosition(({ coords }) => { setPosition([coords.latitude, coords.longitude]); setMessage('Tu ubicación se muestra en el mapa.') }, () => setMessage('No se pudo obtener tu ubicación. Las tiendas siguen disponibles.'), { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 })
  }

  const handleLayerReady = useCallback(() => {
    setBaseLayerReady(true)
    setBaseLayerError('')
  }, [])

  const handleLayerError = useCallback((error: string) => {
    if (!useFallback) {
      setUseFallback(true)
      setBaseLayerError('')
    } else {
      setBaseLayerError(error)
      setBaseLayerReady(false)
    }
  }, [useFallback])

  useEffect(() => {
    if (useFallback) {
      const timer = window.setTimeout(() => setBaseLayerReady(true), 400)
      return () => window.clearTimeout(timer)
    }
  }, [useFallback])

  const retryMap = () => {
    setBaseLayerReady(false)
    setBaseLayerError('')
    setUseFallback(false)
    setMapAttempt((attempt) => attempt + 1)
  }

  return <section className="map-card" aria-labelledby="stores-map-title">
    <div className="map-card__header"><div><span className="eyebrow">Ubicaciones asignadas</span><h2 id="stores-map-title">Mapa de tiendas</h2></div><button className="action-button action-button--ghost" type="button" onClick={locate}>Mi ubicación</button></div>
    <p className="map-help">Mapa interactivo. Ubicación requiere HTTPS o localhost.</p>
    <div className="map-live">
      <MapContainer center={center} zoom={12} scrollWheelZoom className="leaflet-map" attributionControl={false}>
        {!useFallback ? (
          <OpenFreeMapLayer key={`ofm-${mapAttempt}`} onReady={handleLayerReady} onError={handleLayerError} />
        ) : (
          <TileLayer
            key={`fallback-${mapAttempt}`}
            url={FALLBACK_TILE_URL}
            attribution={FALLBACK_ATTRIBUTION}
            eventHandlers={{
              load: () => handleLayerReady(),
              tileload: () => handleLayerReady(),
            }}
          />
        )}
        <AttributionControl prefix={useFallback ? FALLBACK_ATTRIBUTION : "OpenFreeMap | OpenMapTiles | © OpenStreetMap contributors"} />
        <MapViewportReady />
        <Bounds stores={stores} position={position} />
        {stores.map((store) => <Marker key={store.id} position={[store.latitude, store.longitude]} icon={storeIcon} zIndexOffset={100}><Popup><strong>{store.name}</strong><br />{store.address}<br /><button type="button" onClick={() => onSelect?.(store)}>Ver checklist</button></Popup></Marker>)}
        {technicianDisplayPosition && <Marker position={technicianDisplayPosition} icon={technicianIcon}><Popup>Tu ubicación</Popup></Marker>}
      </MapContainer>
      {!baseLayerReady && !baseLayerError && (
        <div className="map-overlay" role="status" aria-live="polite">
          {useFallback ? 'Cargando mapa base alternativo…' : 'Cargando mapa base…'}
        </div>
      )}
      {baseLayerError && (
        <div className="map-overlay map-overlay--error" role="alert">
          <span>No se pudo renderizar el mapa base.</span>
          <button type="button" onClick={retryMap}>Reintentar</button>
        </div>
      )}
    </div>
    {message && <p className="map-status" role="status">{message}</p>}
  </section>
}
