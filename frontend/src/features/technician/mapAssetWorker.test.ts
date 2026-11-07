import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CACHE_PREFIX, MapAssetCache, MAX_AGE } from './mapAssetWorker'
const origin = 'https://app.example.test'
const paths = [
  '/assets/AssignedLocationsMap-a.js',
  '/assets/AssignedLocationsMap-b.css',
  '/assets/Leaflet.VectorGrid-c.js',
  '/assets/lima-pilot-d.geojson',
]
const request = (index = 0) => new Request(origin + paths[index])
let now: number
let entries: Map<string, Response>
let cache: Cache
let storage: CacheStorage
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>
beforeEach(() => {
  now = 1000000
  entries = new Map()
  cache = {
    keys: vi.fn(async () => [...entries.keys()].map((url) => new Request(url))),
    match: vi.fn(async (key: Request) => entries.get(key.url)?.clone()),
    put: vi.fn(async (key: Request, value: Response) => {
      entries.set(key.url, value.clone())
    }),
    delete: vi.fn(async (key: Request) => entries.delete(key.url)),
  } as unknown as Cache
  storage = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
  } as unknown as CacheStorage
  fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () => new Response('abcd', { headers: { 'content-type': 'text/javascript' } }),
    )
})
afterEach(() => vi.useRealTimers())
function policy(limits = {}) {
  return new MapAssetCache(
    { assets: paths, version: 'test' },
    {
      storage,
      fetcher,
      origin,
      now: () => now,
      ...limits,
    },
  )
}
it('almacena un recurso permitido y lo reutiliza sin red', async () => {
  const handler = policy()
  await handler.handle(request())
  fetcher.mockRejectedValue(new Error('offline'))
  expect(await (await handler.handle(request())).text()).toBe('abcd')
  expect(fetcher).toHaveBeenCalledOnce()
  expect(entries.size).toBe(1)
})
it('guarda solo el GeoJSON propio de la lista con MIME JSON y reutiliza la misma política', async () => {
  fetcher.mockResolvedValueOnce(
    new Response('{"type":"FeatureCollection"}', {
      headers: { 'content-type': 'application/geo+json' },
    }),
  )
  const handler = policy()
  await handler.handle(request(3))
  fetcher.mockRejectedValue(new Error('offline'))
  expect(await (await handler.handle(request(3))).text()).toContain('FeatureCollection')
  expect(entries.size).toBe(1)
  expect(handler.accepts(new Request(origin + '/assets/other.geojson'))).toBe(false)
  expect(fetcher).toHaveBeenCalledOnce()
})
it('un recurso ausente falla sin inventar una respuesta offline', async () => {
  fetcher.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(policy().handle(request())).rejects.toThrow('Failed to fetch')
  expect(entries.size).toBe(0)
})
it('elimina recursos caducados, falla sin red y se recupera cuando vuelve', async () => {
  const handler = policy()
  await handler.handle(request())
  now += MAX_AGE
  fetcher.mockRejectedValueOnce(new Error('offline'))
  await expect(handler.handle(request())).rejects.toThrow('offline')
  expect(entries.size).toBe(0)
  expect(await (await handler.handle(request())).text()).toBe('abcd')
  expect(entries.size).toBe(1)
})
it('usar la caché no renueva su caducidad absoluta', async () => {
  const handler = policy()
  await handler.handle(request())
  now += MAX_AGE - 1
  await handler.handle(request())
  now++
  await handler.handle(request())
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('expulsa el más antiguo con solicitudes concurrentes sin renovar por lectura', async () => {
  const handler = policy({ maxEntries: 2 })
  await handler.handle(request(0))
  await handler.handle(request(1))
  await handler.handle(request(0))
  await Promise.all([handler.handle(request(2)), handler.handle(request(1))])
  expect(entries.has(request(0).url)).toBe(false)
  expect(entries.size).toBe(2)
})
it('controla bytes y omite recursos demasiado grandes', async () => {
  const handler = policy({ maxBytes: 6 })
  await handler.handle(request(0))
  await handler.handle(request(1))
  expect(entries.size).toBe(1)
  fetcher.mockResolvedValueOnce(
    new Response('1234567', { headers: { 'content-type': 'text/css' } }),
  )
  expect(await (await handler.handle(request(2))).text()).toBe('1234567')
  expect(entries.has(request(2).url)).toBe(false)
})
it.each(['quota', 'open', 'read'])(
  'fallo de almacenamiento %s no bloquea la red',
  async (failure) => {
    if (failure === 'quota')
      vi.mocked(cache.put).mockRejectedValue(new DOMException('full', 'QuotaExceededError'))
    if (failure === 'open') vi.mocked(storage.open).mockRejectedValue(new Error('denied'))
    if (failure === 'read') vi.mocked(cache.keys).mockRejectedValue(new Error('broken'))
    expect(await (await policy().handle(request())).text()).toBe('abcd')
  },
)
it.each([
  'https://tiles.openfreemap.org/planet/latest/0/0/0.pbf',
  origin + '/api/tiendas/',
  origin + '/',
  origin + '/assets/unknown.js',
  origin + paths[0] + '?token=secret',
])('no intercepta ni guarda %s', async (url) => {
  const handler = policy()
  expect(handler.accepts(new Request(url))).toBe(false)
  await handler.handle(new Request(url))
  expect(storage.open).not.toHaveBeenCalled()
})
it('excluye POST y respuestas HTML, HTTP fallido o no-store', async () => {
  expect(policy().accepts(new Request(request(), { method: 'POST' }))).toBe(false)
  expect(policy().accepts(new Request(request(), { cache: 'no-store' }))).toBe(false)
  expect(
    policy().accepts(
      new Request(request(), { headers: { Authorization: 'Bearer fake-test-only' } }),
    ),
  ).toBe(false)
  for (const response of [
    new Response('html', { headers: { 'content-type': 'text/html' } }),
    new Response('error', { status: 503 }),
    new Response('js', {
      headers: { 'content-type': 'text/javascript', 'cache-control': 'no-store' },
    }),
  ]) {
    fetcher.mockResolvedValueOnce(response)
    await policy().handle(request())
    expect(entries.size).toBe(0)
  }
})
it('tolera que el navegador elimine la caché entre consultas', async () => {
  const handler = policy()
  await handler.handle(request())
  entries.clear()
  await handler.handle(request())
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('elimina únicamente versiones antiguas propias', async () => {
  vi.mocked(storage.keys).mockResolvedValue([
    CACHE_PREFIX + 'old',
    CACHE_PREFIX + 'test',
    'business-data',
  ])
  await policy().activate()
  expect(storage.delete).toHaveBeenCalledExactlyOnceWith(CACHE_PREFIX + 'old')
})
it('termina una red bloqueada sin bucles y permite un intento posterior', async () => {
  vi.useFakeTimers()
  fetcher.mockImplementationOnce(() => new Promise<Response>(() => {}))
  const handler = policy()
  const assertion = expect(handler.handle(request())).rejects.toThrow('timeout')
  await vi.advanceTimersByTimeAsync(4000)
  await assertion
  expect(await (await handler.handle(request())).text()).toBe('abcd')
  expect(fetcher).toHaveBeenCalledTimes(2)
})
