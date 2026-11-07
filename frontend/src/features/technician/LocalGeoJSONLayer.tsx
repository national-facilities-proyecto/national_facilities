import { useEffect, useMemo, useState } from 'react'
import { GeoJSON, useMap } from 'react-leaflet'
import { coversLocations, loadPilot, LOCAL_ATTRIBUTION, type PilotData } from './localPilot'

export function LocalGeoJSONLayer({
  locations,
  onReady,
  onError,
}: {
  locations: readonly { latitude: unknown; longitude: unknown }[]
  onReady(this: void): void
  onError(this: void, message: string): void
}) {
  const map = useMap()
  const [data, setData] = useState<PilotData>()
  useEffect(() => {
    let disposed = false
    let failed = false
    const controller = new AbortController()
    const timer = setTimeout(() => {
      if (disposed) return
      failed = true
      controller.abort()
      onError('Tiempo de espera agotado al cargar la cartografía simplificada.')
    }, 5000)
    void loadPilot(controller.signal)
      .then((loaded) => {
        if (!disposed && !failed) setData(loaded)
      })
      .catch((error: unknown) => {
        if (!disposed && !failed)
          onError(
            error instanceof Error
              ? error.message
              : 'No se pudo cargar la cartografía simplificada.',
          )
      })
      .finally(() => clearTimeout(timer))
    return () => {
      disposed = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [onError])
  const covered = useMemo(
    () => Boolean(data && coversLocations(data, locations)),
    [data, locations],
  )
  useEffect(() => {
    if (!data) return
    if (!covered) {
      onError('La cartografía simplificada no cubre todas las ubicaciones consultadas.')
      return
    }
    map.attributionControl?.setPrefix(LOCAL_ATTRIBUTION)
    onReady()
  }, [data, covered, map, onReady, onError])
  if (!data || !covered) return null
  return (
    <GeoJSON
      data={data}
      style={(feature) => {
        // React Leaflet types properties as any; the source was validated as PilotData.
        const properties = feature?.properties as
          PilotData['features'][number]['properties'] | undefined
        return properties?.kind === 'district'
          ? { color: '#39756a', weight: 1.5, fillColor: '#e6eee1', fillOpacity: 0.5 }
          : { color: '#b7791f', weight: 2.2, opacity: 0.85 }
      }}
      onEachFeature={(feature, layer) => {
        const properties = feature.properties as PilotData['features'][number]['properties']
        const label = document.createElement('span')
        label.textContent = properties.name
        layer.bindTooltip(label, { sticky: true })
      }}
    />
  )
}
