import L from 'leaflet'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { VectorMapLayer } from './vectorTileTransport'
import { openFreeMapProvider } from './mapProviders'
const mocks = vi.hoisted(() => ({ create: vi.fn(), map: {} }))
vi.mock('react-leaflet', () => ({ useMap: () => mocks.map }))
vi.mock('./openFreeMap', () => ({ createOpenFreeMapLayer: mocks.create }))
import { MapBaseLayer } from './MapBaseLayer'
const flush = () => act(async () => {})
function makeLayer() {
  const layer = new L.Layer() as VectorMapLayer
  layer.addTo = vi.fn(() => layer)
  layer.remove = vi.fn(() => layer)
  layer.dispose = vi.fn()
  return layer
}
let layer: VectorMapLayer
beforeEach(() => {
  vi.useFakeTimers()
  layer = makeLayer()
  mocks.create.mockReset().mockResolvedValue(layer)
})
afterEach(() => {
  cleanup()
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})
function setup() {
  const props = { onReady: vi.fn(), onError: vi.fn(), onLoading: vi.fn(), timeoutMs: 1000 }
  return { ...render(<MapBaseLayer {...props} />), ...props, props }
}
it('carga OpenFreeMap y cancela el timer al terminar', async () => {
  const { onReady, onError } = setup()
  await flush()
  act(() => {
    layer.fire('load')
  })
  await act(async () => vi.advanceTimersByTime(60000))
  expect(onReady).toHaveBeenCalledWith(openFreeMapProvider)
  expect(onError).not.toHaveBeenCalled()
  expect(mocks.create).toHaveBeenCalledOnce()
})
it('retira y cancela la capa fallida sin bucles ni eventos tardíos', async () => {
  const { onError, onReady } = setup()
  await flush()
  act(() => {
    layer.fire('tileerror').fire('load').fire('tileerror')
  })
  await act(async () => vi.advanceTimersByTime(600000))
  expect(layer.remove).toHaveBeenCalledOnce()
  expect(layer.dispose).toHaveBeenCalledOnce()
  for (const event of ['load', 'loading', 'tileerror'] as const)
    expect(layer.listens(event)).toBe(false)
  expect(onError).toHaveBeenCalledOnce()
  expect(onReady).not.toHaveBeenCalled()
  expect(mocks.create).toHaveBeenCalledOnce()
})
it('mantiene timeout al solicitar teselas después de estar listo', async () => {
  const { onError } = setup()
  await flush()
  act(() => {
    layer.fire('load').fire('loading')
  })
  await act(async () => vi.advanceTimersByTime(1000))
  expect(onError).toHaveBeenCalledWith('Tiempo de espera agotado al cargar el mapa base.')
})
it('permite recuperación manual con una nueva capa del principal', async () => {
  const { rerender, props, onReady } = setup()
  await flush()
  act(() => {
    layer.fire('tileerror')
  })
  const recovered = makeLayer()
  mocks.create.mockResolvedValueOnce(recovered)
  rerender(<MapBaseLayer key="retry" {...props} />)
  await flush()
  act(() => {
    recovered.fire('load')
  })
  expect(mocks.create).toHaveBeenCalledTimes(2)
  expect(onReady).toHaveBeenCalledWith(openFreeMapProvider)
})
it.each(['unmount', 'timeout'])('libera una capa tardía después de %s', async (reason) => {
  let resolve!: (value: VectorMapLayer) => void
  mocks.create.mockReturnValueOnce(
    new Promise<VectorMapLayer>((done) => {
      resolve = done
    }),
  )
  const { unmount, onReady, onError } = setup()
  await flush()
  if (reason === 'unmount') unmount()
  else await act(async () => vi.advanceTimersByTime(1000))
  await act(async () => {
    resolve(layer)
  })
  expect(layer.addTo).not.toHaveBeenCalled()
  expect(layer.dispose).toHaveBeenCalledOnce()
  expect(layer.remove).toHaveBeenCalledOnce()
  expect(onReady).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledTimes(reason === 'timeout' ? 1 : 0)
})
it.each(['import', 'installation'])('normaliza fallo de %s', async (stage) => {
  if (stage === 'import') mocks.create.mockRejectedValueOnce(new Error('import failed'))
  else
    layer.addTo = vi.fn(() => {
      throw new Error('addTo failed')
    })
  const { onError } = setup()
  await flush()
  expect(onError).toHaveBeenCalledWith('No se pudo inicializar el mapa base.')
})
