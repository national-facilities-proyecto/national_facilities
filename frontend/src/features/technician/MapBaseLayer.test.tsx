import L from 'leaflet'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { VectorMapLayer } from './vectorTileTransport'
import { getMapProviders, type MapProvider } from './mapProviders'

const mocks = vi.hoisted(() => ({ primary: vi.fn(), backup: vi.fn(), map: {} }))
vi.mock('react-leaflet', () => ({ useMap: () => mocks.map }))
vi.mock('./openFreeMap', () => ({
  createOpenFreeMapLayer: mocks.primary,
  createVectorMapLayer: mocks.backup,
}))
import { MapBaseLayer } from './MapBaseLayer'

const providers = getMapProviders('https://maps.example.org/lima/v1/{z}/{x}/{y}.pbf')
const flush = () => act(async () => {})
function makeLayer() {
  const layer = new L.Layer() as VectorMapLayer
  layer.addTo = vi.fn(() => layer)
  layer.remove = vi.fn(() => layer)
  layer.dispose = vi.fn()
  return layer
}
let primary: VectorMapLayer
let backup: VectorMapLayer
beforeEach(() => {
  vi.useFakeTimers()
  primary = makeLayer()
  backup = makeLayer()
  mocks.primary.mockReset().mockResolvedValue(primary)
  mocks.backup.mockReset().mockResolvedValue(backup)
})
afterEach(() => {
  cleanup()
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})
function setup() {
  const onReady = vi.fn()
  const onError = vi.fn()
  const onLoading = vi.fn<(provider: MapProvider) => void>()
  const props = { onReady, onError, onLoading, providers, timeoutMs: 1000 }
  return { ...render(<MapBaseLayer {...props} />), props, onReady, onError, onLoading }
}

it('carga OpenFreeMap sin crear ni consultar AWS', async () => {
  const { onReady } = setup()
  await flush()
  act(() => {
    primary.fire('load')
  })
  await act(async () => vi.advanceTimersByTime(60000))
  expect(onReady).toHaveBeenCalledWith(providers[0])
  expect(mocks.primary).toHaveBeenCalledOnce()
  expect(mocks.backup).not.toHaveBeenCalled()
})

it('retira y cancela la capa fallida antes de instalar AWS con los mismos eventos', async () => {
  const { onReady, onError, onLoading } = setup()
  await flush()
  act(() => {
    primary.fire('tileerror')
  })
  await flush()
  expect(primary.remove).toHaveBeenCalledOnce()
  expect(primary.dispose).toHaveBeenCalledOnce()
  expect(primary.listens('load')).toBe(false)
  expect(primary.listens('loading')).toBe(false)
  expect(primary.listens('tileerror')).toBe(false)
  expect(mocks.backup).toHaveBeenCalledWith(providers[1])
  expect(vi.mocked(primary.remove).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(backup.addTo).mock.invocationCallOrder[0],
  )
  act(() => {
    primary.fire('load')
  })
  expect(onReady).not.toHaveBeenCalled()
  act(() => {
    backup.fire('load')
  })
  expect(onReady).toHaveBeenCalledWith(providers[1])
  expect(onLoading.mock.calls.map(([provider]) => provider.id)).toEqual(['openfreemap', 'aws'])
  expect(onError).not.toHaveBeenCalled()
})

it('activa AWS tras timeout del principal y termina sin bucles si AWS tampoco responde', async () => {
  const { onError } = setup()
  await flush()
  await act(async () => vi.advanceTimersByTime(1000))
  expect(mocks.backup).toHaveBeenCalledOnce()
  await act(async () => vi.advanceTimersByTime(1000))
  expect(onError).toHaveBeenCalledWith('Tiempo de espera agotado al cargar el mapa base.')
  await act(async () => vi.advanceTimersByTime(600000))
  expect(mocks.primary).toHaveBeenCalledOnce()
  expect(mocks.backup).toHaveBeenCalledOnce()
  expect(backup.remove).toHaveBeenCalledOnce()
  expect(onError).toHaveBeenCalledOnce()
})

it('termina tras errores de ambos orígenes e ignora eventos repetidos o tardíos', async () => {
  const { onError, onReady } = setup()
  await flush()
  act(() => {
    primary.fire('tileerror')
  })
  await flush()
  act(() => {
    backup.fire('tileerror')
  })
  act(() => {
    primary.fire('tileerror').fire('load')
    backup.fire('tileerror').fire('load')
  })
  await act(async () => vi.advanceTimersByTime(600000))
  expect(onError).toHaveBeenCalledOnce()
  expect(onReady).not.toHaveBeenCalled()
  expect(mocks.primary).toHaveBeenCalledOnce()
  expect(mocks.backup).toHaveBeenCalledOnce()
})

it('detecta fallo de nuevas teselas después de estar listo y vigila su timeout', async () => {
  const { onReady } = setup()
  await flush()
  act(() => {
    primary.fire('load')
  })
  expect(onReady).toHaveBeenCalledWith(providers[0])
  act(() => {
    primary.fire('loading')
  })
  await act(async () => vi.advanceTimersByTime(1000))
  expect(mocks.backup).toHaveBeenCalledOnce()
  act(() => {
    backup.fire('load')
  })
  expect(onReady).toHaveBeenLastCalledWith(providers[1])
})

it('permite recuperación manual empezando otra vez por el principal', async () => {
  const { rerender, props, onReady } = setup()
  await flush()
  act(() => {
    primary.fire('tileerror')
  })
  await flush()
  act(() => {
    backup.fire('load')
  })
  const recovered = makeLayer()
  mocks.primary.mockResolvedValueOnce(recovered)
  rerender(<MapBaseLayer key="manual" {...props} />)
  await flush()
  expect(backup.remove).toHaveBeenCalledOnce()
  act(() => {
    recovered.fire('load')
  })
  expect(mocks.primary).toHaveBeenCalledTimes(2)
  expect(mocks.backup).toHaveBeenCalledOnce()
  expect(onReady).toHaveBeenLastCalledWith(providers[0])
})

it.each(['primary', 'backup'] as const)(
  'libera una capa %s que llega después del desmontaje',
  async (origin) => {
    let resolve!: (layer: VectorMapLayer) => void
    const pending = new Promise<VectorMapLayer>((done) => {
      resolve = done
    })
    mocks[origin].mockReturnValueOnce(pending)
    const { unmount, onReady, onError } = setup()
    await flush()
    if (origin === 'backup') {
      act(() => {
        primary.fire('tileerror')
      })
      await flush()
    }
    unmount()
    const late = makeLayer()
    await act(async () => {
      resolve(late)
      await pending
    })
    expect(late.addTo).not.toHaveBeenCalled()
    expect(late.dispose).toHaveBeenCalledOnce()
    expect(late.remove).toHaveBeenCalledOnce()
    expect(onReady).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  },
)

it('libera un import tardío del principal después de activar AWS por timeout', async () => {
  let resolve!: (layer: VectorMapLayer) => void
  mocks.primary.mockReturnValueOnce(
    new Promise<VectorMapLayer>((done) => {
      resolve = done
    }),
  )
  const { onReady } = setup()
  await flush()
  await act(async () => vi.advanceTimersByTime(1000))
  const late = makeLayer()
  await act(async () => {
    resolve(late)
  })
  expect(late.addTo).not.toHaveBeenCalled()
  expect(late.dispose).toHaveBeenCalledOnce()
  act(() => {
    backup.fire('load')
  })
  expect(onReady).toHaveBeenCalledWith(providers[1])
})

it('recupera errores de inicialización y de instalación de la capa', async () => {
  mocks.primary.mockRejectedValueOnce(new Error('import failed'))
  backup.addTo = vi.fn(() => {
    throw new Error('addTo failed')
  })
  const { onError } = setup()
  await flush()
  expect(onError).toHaveBeenCalledWith('No se pudo inicializar el mapa base.')
  expect(backup.remove).toHaveBeenCalledOnce()
})
