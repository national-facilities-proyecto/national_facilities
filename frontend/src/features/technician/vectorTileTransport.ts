import L from 'leaflet'
import Pbf from 'pbf'
import { VectorTile } from 'vector-tile'

type Coordinates = { x: number; y: number; z: number }
type Tile = { layers: Record<string, unknown> }

export type VectorMapLayer = L.Layer & {
  _getVectorTilePromise(coords: Coordinates): Promise<Tile>
  dispose(this: void): void
}

/**
 * VectorGrid 1.3.0 convierte HTTP != 2xx en tiles vacíos y deja rechazos sin capturar.
 * Sustituimos únicamente su punto de extensión de transporte/decodificación;
 * VectorGrid conserva el renderizado y recibe siempre una promesa resuelta.
 */
export function attachVectorTileTransport(layer: VectorMapLayer, template: string) {
  const controller = new AbortController()
  let stopped = false
  layer.dispose = () => {
    stopped = true
    controller.abort()
  }
  layer.once('remove', layer.dispose)
  layer._getVectorTilePromise = async (coords) => {
    const empty = { layers: {} }
    if (stopped) return empty
    try {
      const response = await fetch(L.Util.template(template, coords), {
        signal: controller.signal,
        credentials: 'omit',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()
      if (stopped) return empty
      const tile = new VectorTile(new Pbf(new Uint8Array(buffer)))
      for (const tileLayer of Object.values(tile.layers)) {
        tileLayer.features = Array.from({ length: tileLayer.length }, (_, index) => {
          const feature = tileLayer.feature(index)
          feature.geometry = feature.loadGeometry()
          return feature
        })
      }
      return tile
    } catch (error) {
      if (!stopped) {
        // Detener también los tiles concurrentes del mismo origen fallido.
        layer.dispose()
        layer.fire('tileerror', { error, coords })
      }
      return empty
    }
  }
  return layer
}
