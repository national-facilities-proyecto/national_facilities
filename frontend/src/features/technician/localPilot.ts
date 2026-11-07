import type {
  FeatureCollection,
  MultiLineString,
  MultiPolygon,
  Polygon,
  LineString,
  Position,
} from 'geojson'
import pilotUrl from './data/lima-pilot.geojson?url'
import { toProviderLatLng } from './mapProviderAdapter'

export { pilotUrl }
export const MAX_PILOT_BYTES = 1024 * 1024
export const LOCAL_ATTRIBUTION =
  'Cartografía simplificada | <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>'
export const SIMPLIFIED_MESSAGE =
  'El mapa principal no está disponible. Se está utilizando cartografía simplificada'
type Geometry = Polygon | MultiPolygon | LineString | MultiLineString
export type PilotData = FeatureCollection<Geometry, { kind: 'district' | 'road'; name: string }> & {
  metadata: {
    coverage: [number, number, number, number]
    version: string
    sourceTimestamp: string
    license: 'ODbL-1.0'
  }
}
type Location = { latitude: unknown; longitude: unknown }
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function validatePilot(value: unknown): PilotData {
  const invalid = () => {
    throw new Error('La cartografía simplificada está corrupta o tiene un formato incompatible.')
  }
  if (
    !record(value) ||
    value.type !== 'FeatureCollection' ||
    !Array.isArray(value.features) ||
    !value.features.length ||
    value.features.length > 500 ||
    !record(value.metadata)
  )
    return invalid()
  const { coverage, version, sourceTimestamp, license } = value.metadata
  if (
    !Array.isArray(coverage) ||
    coverage.length !== 4 ||
    !coverage.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
    coverage[0] < -180 ||
    coverage[2] > 180 ||
    coverage[1] < -85 ||
    coverage[3] > 85 ||
    coverage[0] >= coverage[2] ||
    coverage[1] >= coverage[3] ||
    typeof version !== 'string' ||
    !version ||
    typeof sourceTimestamp !== 'string' ||
    !Number.isFinite(Date.parse(sourceTimestamp)) ||
    license !== 'ODbL-1.0'
  )
    return invalid()
  let positions = 0
  let districts = 0
  let roads = 0
  const position = (p: unknown): p is Position => {
    positions++
    return (
      positions <= 50000 &&
      Array.isArray(p) &&
      p.length === 2 &&
      p.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
      p[0] >= -180 &&
      p[0] <= 180 &&
      p[1] >= -85 &&
      p[1] <= 85
    )
  }
  const line = (p: unknown): p is Position[] =>
    Array.isArray(p) && p.length >= 2 && p.every(position)
  const ring = (p: unknown) => {
    if (!line(p) || p.length < 4 || p[0][0] !== p.at(-1)![0] || p[0][1] !== p.at(-1)![1])
      return false
    let area = 0
    for (let i = 1; i < p.length; i++) area += p[i - 1][0] * p[i][1] - p[i][0] * p[i - 1][1]
    return Math.abs(area) > 1e-12
  }
  const polygon = (p: unknown) => Array.isArray(p) && p.length > 0 && p.every(ring)
  for (const feature of value.features) {
    if (
      !record(feature) ||
      feature.type !== 'Feature' ||
      !record(feature.properties) ||
      !record(feature.geometry) ||
      typeof feature.properties.name !== 'string' ||
      !feature.properties.name.trim()
    )
      return invalid()
    const { type, coordinates } = feature.geometry
    if (feature.properties.kind === 'district') {
      if (
        !(type === 'Polygon'
          ? polygon(coordinates)
          : type === 'MultiPolygon' &&
            Array.isArray(coordinates) &&
            coordinates.length &&
            coordinates.every(polygon))
      )
        return invalid()
      districts++
    } else if (feature.properties.kind === 'road') {
      if (
        !(type === 'LineString'
          ? line(coordinates)
          : type === 'MultiLineString' &&
            Array.isArray(coordinates) &&
            coordinates.length &&
            coordinates.every(line))
      )
        return invalid()
      roads++
    } else return invalid()
  }
  if (!districts || !roads) return invalid()
  return value as unknown as PilotData
}

// Point-in-polygon, including outer edges and excluding holes; never bbox-only coverage.
function inRing(x: number, y: number, ring: Position[]) {
  let inside = false
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = ring[i - 1]
    const [bx, by] = ring[i]
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax)
    if (
      Math.abs(cross) <= 1e-10 &&
      x >= Math.min(ax, bx) - 1e-10 &&
      x <= Math.max(ax, bx) + 1e-10 &&
      y >= Math.min(ay, by) - 1e-10 &&
      y <= Math.max(ay, by) + 1e-10
    )
      return true
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside
  }
  return inside
}
export function coversLocations(data: PilotData, locations: readonly Location[]) {
  return (
    locations.length > 0 &&
    locations.every((location) => {
      const pair = toProviderLatLng(location)
      if (!pair) return false
      const [y, x] = pair
      const [west, south, east, north] = data.metadata.coverage
      if (x < west || x > east || y < south || y > north) return false
      return data.features.some((feature) => {
        if (feature.properties.kind !== 'district') return false
        const geometry = feature.geometry
        const polygons =
          geometry.type === 'Polygon'
            ? [geometry.coordinates]
            : geometry.type === 'MultiPolygon'
              ? geometry.coordinates
              : []
        return polygons.some(
          (rings) => inRing(x, y, rings[0]) && !rings.slice(1).some((hole) => inRing(x, y, hole)),
        )
      })
    })
  )
}

export async function loadPilot(signal: AbortSignal) {
  const response = await fetch(pilotUrl, { signal, credentials: 'omit' })
  if (!response.ok) throw new Error('No se pudo cargar la cartografía simplificada local.')
  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > MAX_PILOT_BYTES)
    throw new Error('La cartografía simplificada supera el tamaño permitido.')
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('La cartografía simplificada está corrupta.')
  }
  return validatePilot(data)
}
