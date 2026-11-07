import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { coversLocations, loadPilot, validatePilot, MAX_PILOT_BYTES } from './localPilot'

const text = readFileSync(resolve('src/features/technician/data/lima-pilot.geojson'), 'utf8')
const actual: unknown = JSON.parse(text)
afterEach(() => vi.unstubAllGlobals())
it('valida el dataset OSM versionado real y las dos tiendas del piloto sin alterar sus coordenadas', () => {
  const data = validatePilot(actual)
  expect(data.features.filter((f) => f.properties.kind === 'district')).toHaveLength(7)
  expect(data.features.filter((f) => f.properties.kind === 'road')).toHaveLength(116)
  expect(data.metadata.license).toBe('ODbL-1.0')
  expect(new TextEncoder().encode(text).byteLength).toBeLessThan(MAX_PILOT_BYTES)
  expect(
    coversLocations(data, [
      { latitude: -12.1739, longitude: -77.0181 },
      { latitude: -12.1504, longitude: -76.9718 },
      { latitude: -12.13, longitude: -76.99 },
    ]),
  ).toBe(true)
})
it.each([
  null,
  {},
  { type: 'FeatureCollection', features: [] },
  { type: 'FeatureCollection', features: [{}], metadata: {} },
])('rechaza GeoJSON incompleto: %j', (input) => {
  expect(() => validatePilot(input)).toThrow()
})
it.each(['coordinates', 'closure', 'geometry', 'roads', 'license', 'extent'])(
  'rechaza corrupción de %s',
  (failure) => {
    const data = structuredClone(validatePilot(actual))
    const district = data.features[0].geometry
    if (district.type !== 'MultiPolygon') throw new Error('Expected source district')
    if (failure === 'coordinates') district.coordinates[0][0][1][0] = Infinity
    if (failure === 'closure') district.coordinates[0][0].pop()
    if (failure === 'geometry') district.coordinates.length = 0
    if (failure === 'roads')
      data.features = data.features.filter((f) => f.properties.kind === 'district')
    if (failure === 'license') Reflect.set(data.metadata, 'license', 'unknown')
    if (failure === 'extent') data.metadata.coverage = [1, 1, -1, -1]
    expect(() => validatePilot(data)).toThrow()
  },
)
it('no confunde estar dentro del bbox con cobertura y exige cubrir todas las tiendas', () => {
  const data = validatePilot(actual)
  expect(coversLocations(data, [{ latitude: -12.26, longitude: -77.1 }])).toBe(false) // Ocean inside bbox.
  expect(
    coversLocations(data, [
      { latitude: -12.17, longitude: -77.02 },
      { latitude: -16, longitude: -71 },
    ]),
  ).toBe(false)
  expect(coversLocations(data, [{ latitude: NaN, longitude: -77 }])).toBe(false)
  expect(coversLocations(data, [])).toBe(false)
})
it('evalúa huecos y bordes con geometría sintética solo para el algoritmo de cobertura', () => {
  const fixture = validatePilot({
    type: 'FeatureCollection',
    metadata: {
      coverage: [0, 0, 4, 4],
      version: 'synthetic-test-only',
      sourceTimestamp: '2026-11-07T00:00:00Z',
      license: 'ODbL-1.0',
    },
    features: [
      {
        type: 'Feature',
        properties: { kind: 'district', name: 'Synthetic test polygon' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [4, 0],
              [4, 4],
              [0, 4],
              [0, 0],
            ],
            [
              [1, 1],
              [2, 1],
              [2, 2],
              [1, 2],
              [1, 1],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { kind: 'road', name: 'Synthetic test line' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [4, 4],
          ],
        },
      },
    ],
  })
  expect(coversLocations(fixture, [{ latitude: 3, longitude: 3 }])).toBe(true)
  expect(coversLocations(fixture, [{ latitude: 0, longitude: 0 }])).toBe(true)
  expect(coversLocations(fixture, [{ latitude: 1.5, longitude: 1.5 }])).toBe(false)
})
it('carga desde un archivo propio sin credenciales y valida antes de devolver', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(text))
  vi.stubGlobal('fetch', fetcher)
  const controller = new AbortController()
  expect((await loadPilot(controller.signal)).features).toHaveLength(123)
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('lima-pilot'), {
    signal: controller.signal,
    credentials: 'omit',
  })
})
it.each(['404', 'corrupt', 'size', 'network'])(
  'normaliza un respaldo local %s',
  async (failure) => {
    const fetcher = vi.fn()
    if (failure === '404') fetcher.mockResolvedValue(new Response('', { status: 404 }))
    if (failure === 'corrupt') fetcher.mockResolvedValue(new Response('{bad json'))
    if (failure === 'size') fetcher.mockResolvedValue(new Response(' '.repeat(MAX_PILOT_BYTES + 1)))
    if (failure === 'network') fetcher.mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetcher)
    await expect(loadPilot(new AbortController().signal)).rejects.toThrow()
  },
)
