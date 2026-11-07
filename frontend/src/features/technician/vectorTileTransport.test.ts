import L from 'leaflet'
import { afterEach, expect, it, vi } from 'vitest'
import { attachVectorTileTransport, type VectorMapLayer } from './vectorTileTransport'

const url = 'https://maps.example.org/{z}/{x}/{y}.pbf'
const coords = { x: 4685, y: 8750, z: 14 }
function setup() {
  const layer = attachVectorTileTransport(new L.Layer() as VectorMapLayer, url)
  const error = vi.fn<(event: unknown) => void>()
  layer.on('tileerror', error)
  return { layer, error }
}
afterEach(() => vi.unstubAllGlobals())

it('pide una sola vez XYZ con cancelación y sin credenciales y decodifica MVT vacío válido', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array()))
  vi.stubGlobal('fetch', fetcher)
  const { layer, error } = setup()
  expect(await layer._getVectorTilePromise(coords)).toEqual({ layers: {} })
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    'https://maps.example.org/14/4685/8750.pbf',
    expect.objectContaining({ credentials: 'omit' }),
  )
  expect(error).not.toHaveBeenCalled()
})

it.each([403, 404, 429, 500, 503])(
  'HTTP %s provoca tileerror en vez de un falso load correcto',
  async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('error', { status }))
    vi.stubGlobal('fetch', fetcher)
    const { layer, error } = setup()
    await expect(layer._getVectorTilePromise(coords)).resolves.toEqual({ layers: {} })
    expect(error).toHaveBeenCalledOnce()
    expect(error.mock.calls[0][0]).toMatchObject({ error: new Error(`HTTP ${status}`) })
    await layer._getVectorTilePromise(coords)
    expect(fetcher).toHaveBeenCalledOnce()
  },
)

it.each(['network', 'corrupt', 'body'])(
  'normaliza fallo %s sin rechazos sin capturar',
  async (failure) => {
    const fetcher = vi.fn()
    if (failure === 'network') fetcher.mockRejectedValue(new TypeError('Failed to fetch'))
    if (failure === 'corrupt') fetcher.mockResolvedValue(new Response('<html>not a tile</html>'))
    if (failure === 'body')
      fetcher.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.reject(new Error('body failed')),
      })
    vi.stubGlobal('fetch', fetcher)
    const { layer, error } = setup()
    await expect(layer._getVectorTilePromise(coords)).resolves.toEqual({ layers: {} })
    expect(error).toHaveBeenCalledOnce()
  },
)

it('cancela las peticiones concurrentes al retirar una capa sin emitir errores tardíos', async () => {
  const fetcher = vi.fn(
    (_url: string, { signal }: RequestInit) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }),
  )
  vi.stubGlobal('fetch', fetcher)
  const { layer, error } = setup()
  const first = layer._getVectorTilePromise(coords)
  const second = layer._getVectorTilePromise({ ...coords, x: 4686 })
  layer.fire('remove')
  await expect(first).resolves.toEqual({ layers: {} })
  await expect(second).resolves.toEqual({ layers: {} })
  expect(error).not.toHaveBeenCalled()
  await layer._getVectorTilePromise(coords)
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('no decodifica una respuesta tardía después de dispose', async () => {
  let resolve!: (response: Response) => void
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done
        }),
    ),
  )
  const { layer, error } = setup()
  const pending = layer._getVectorTilePromise(coords)
  layer.dispose()
  resolve(new Response('<html>late</html>'))
  await expect(pending).resolves.toEqual({ layers: {} })
  expect(error).not.toHaveBeenCalled()
})

it('decodifica y normaliza una tesela real con capa y geometría para el renderer existente', async () => {
  // MVT mínimo: capa water, versión 2, extensión 4096 y un punto (1, 1).
  const bytes = new Uint8Array([
    26, 25, 10, 5, 119, 97, 116, 101, 114, 18, 9, 8, 1, 24, 1, 34, 3, 9, 2, 2, 40, 128, 32, 120, 2,
  ])
  // Ajustar longitud del mensaje exterior al tamaño real del cuerpo.
  bytes[1] = bytes.length - 2
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes)))
  const { layer, error } = setup()
  const tile = await layer._getVectorTilePromise(coords)
  expect(tile.layers.water).toMatchObject({ features: [{ type: 1, geometry: [[{ x: 1, y: 1 }]] }] })
  expect(error).not.toHaveBeenCalled()
})
