import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  map: { attributionControl: { setPrefix: vi.fn() } },
  draws: vi.fn(),
}))
vi.mock('react-leaflet', () => ({
  useMap: () => mocks.map,
  GeoJSON: (props: unknown) => {
    mocks.draws(props)
    return <div data-testid="local-layer" />
  },
}))
import { LocalGeoJSONLayer } from './LocalGeoJSONLayer'
const text = readFileSync(resolve('src/features/technician/data/lima-pilot.geojson'), 'utf8')
const locations = [{ latitude: -12.1739, longitude: -77.0181 }]
const flush = () => act(async () => {})
beforeEach(() => {
  mocks.draws.mockClear()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(text)))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it('instala GeoJSON con cobertura y actualiza la atribución sin ajustar la vista', async () => {
  const onReady = vi.fn()
  const view = render(
    <LocalGeoJSONLayer locations={locations} onReady={onReady} onError={vi.fn()} />,
  )
  await flush()
  expect(view.getByTestId('local-layer')).toBeVisible()
  expect(onReady).toHaveBeenCalledOnce()
  expect(mocks.map.attributionControl.setPrefix).toHaveBeenCalledWith(
    expect.stringContaining('Cartografía simplificada'),
  )
})
it('retira el respaldo al cambiar a tiendas fuera de cobertura sin volver a descargarlo', async () => {
  const onError = vi.fn()
  const onReady = vi.fn()
  const view = render(
    <LocalGeoJSONLayer locations={locations} onReady={onReady} onError={onError} />,
  )
  await flush()
  view.rerender(
    <LocalGeoJSONLayer
      locations={[{ latitude: -16, longitude: -71 }]}
      onReady={onReady}
      onError={onError}
    />,
  )
  expect(view.queryByTestId('local-layer')).not.toBeInTheDocument()
  expect(onError).toHaveBeenCalledWith(expect.stringContaining('no cubre'))
  expect(fetch).toHaveBeenCalledOnce()
})
it('cancela al desmontar y descarta una respuesta tardía', async () => {
  let resolveResponse!: (value: Response) => void
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolveResponse = done
        }),
    ),
  )
  const onReady = vi.fn()
  const onError = vi.fn()
  const view = render(
    <LocalGeoJSONLayer locations={locations} onReady={onReady} onError={onError} />,
  )
  view.unmount()
  await act(async () => {
    resolveResponse(new Response(text))
  })
  expect(onReady).not.toHaveBeenCalled()
  expect(onError).not.toHaveBeenCalled()
  expect(mocks.draws).not.toHaveBeenCalled()
})
it('finaliza el timeout local una sola vez sin instalar una respuesta tardía', async () => {
  vi.useFakeTimers()
  let resolveResponse!: (value: Response) => void
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolveResponse = done
        }),
    ),
  )
  const onError = vi.fn()
  const onReady = vi.fn()
  render(<LocalGeoJSONLayer locations={locations} onReady={onReady} onError={onError} />)
  await act(async () => vi.advanceTimersByTime(5000))
  await act(async () => {
    resolveResponse(new Response(text))
  })
  await act(async () => vi.advanceTimersByTime(60000))
  expect(onError).toHaveBeenCalledOnce()
  expect(onReady).not.toHaveBeenCalled()
})
