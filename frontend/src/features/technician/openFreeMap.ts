import L from 'leaflet'
import { openFreeMapProvider, type MapProvider } from './mapProviders'
import { attachVectorTileTransport, type VectorMapLayer } from './vectorTileTransport'

type VectorTileStyle =
  | L.PathOptions
  | L.PathOptions[]
  | ((properties: Record<string, unknown>, zoom: number) => L.PathOptions | L.PathOptions[])

type VectorGridFactory = {
  protobuf: (
    url: string,
    options: {
      interactive: boolean
      maxNativeZoom: number
      maxZoom: number
      rendererFactory: unknown
      vectorTileLayerStyles: Record<string, VectorTileStyle>
    },
  ) => VectorMapLayer
}

const disabledLayers = Object.fromEntries(
  [
    'aeroway',
    'boundary',
    'building',
    'housenumber',
    'mountain_peak',
    'place',
    'poi',
    'transportation_name',
    'water_name',
  ].map((layer) => [layer, []]),
) as Record<string, VectorTileStyle>

const vectorTileLayerStyles: Record<string, VectorTileStyle> = {
  ...disabledLayers,
  water: { fill: true, fillColor: '#cfeaf4', fillOpacity: 1, stroke: false },
  waterway: { color: '#9acddd', opacity: 0.9, weight: 1 },
  landcover: { fill: true, fillColor: '#e6eee1', fillOpacity: 0.85, stroke: false },
  landuse: { fill: true, fillColor: '#f1efe6', fillOpacity: 0.75, stroke: false },
  park: { fill: true, fillColor: '#dcebd7', fillOpacity: 0.9, stroke: false },
  transportation: (properties) => {
    if (
      !['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(String(properties.class))
    )
      return []
    return { color: '#ffffff', opacity: 0.95, weight: 1.5 }
  },
}

let vectorGrid: Promise<VectorGridFactory> | undefined

function createVectorMapLayer(provider: MapProvider) {
  if (!vectorGrid) {
    window.L = L
    vectorGrid = import('leaflet.vectorgrid')
      .then(() => {
        const leaflet = L as typeof L & {
          canvas: typeof L.canvas & { tile?: unknown }
          vectorGrid?: VectorGridFactory
        }
        if (!leaflet.vectorGrid || !leaflet.canvas.tile)
          throw new Error('Leaflet.VectorGrid no se pudo inicializar.')
        return leaflet.vectorGrid
      })
      .catch((error: unknown) => {
        vectorGrid = undefined
        throw error
      })
  }
  return vectorGrid.then((factory) =>
    attachVectorTileTransport(
      factory.protobuf(provider.url, {
        interactive: false,
        maxNativeZoom: 14,
        maxZoom: 18,
        rendererFactory: (L as typeof L & { canvas: typeof L.canvas & { tile: unknown } }).canvas
          .tile,
        vectorTileLayerStyles,
      }),
      provider.url,
    ),
  )
}

export function createOpenFreeMapLayer() {
  return createVectorMapLayer(openFreeMapProvider)
}
