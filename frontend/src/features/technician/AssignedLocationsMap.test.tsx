import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mapMocks = vi.hoisted(() => {
  const listeners = new Map<string, () => void>()
  const layer = {
    addTo: vi.fn(),
    once: vi.fn((event: string, callback: () => void) => {
      listeners.set(event, callback)
      return layer
    }),
    remove: vi.fn(),
  }
  return {
    createLayer: vi.fn(() => Promise.resolve(layer)),
    emit: (event: string) => listeners.get(event)?.(),
    layer,
    listeners,
  }
})

vi.mock('react-leaflet', () => ({
  useMap: () => ({}),
  AttributionControl: () => null,
  MapContainer: () => null,
  Marker: () => null,
  Popup: () => null,
}))

vi.mock('./openFreeMap', () => ({ createOpenFreeMapLayer: mapMocks.createLayer }))

import { OpenFreeMapLayer } from './AssignedLocationsMap'

beforeEach(() => {
  vi.useFakeTimers()
  mapMocks.createLayer.mockClear()
  mapMocks.layer.addTo.mockClear()
  mapMocks.layer.once.mockClear()
  mapMocks.layer.remove.mockClear()
  mapMocks.listeners.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('transiciona de loading a ready cuando Leaflet carga tiles vectoriales de OpenFreeMap', async () => {
  const onReady = vi.fn()
  render(<OpenFreeMapLayer onReady={onReady} onError={vi.fn()} timeoutMs={1000} />)
  await act(async () => {})

  act(() => mapMocks.emit('load'))

  expect(onReady).toHaveBeenCalledOnce()
  expect(mapMocks.createLayer).toHaveBeenCalledOnce()
})

it('informa error recuperable cuando OpenFreeMap no entrega un tile vectorial', async () => {
  const onError = vi.fn()
  render(<OpenFreeMapLayer onReady={vi.fn()} onError={onError} timeoutMs={1200} />)
  await act(async () => {})

  act(() => mapMocks.emit('tileerror'))

  expect(onError).toHaveBeenCalledWith('No se pudo cargar el mapa base.')

  act(() => mapMocks.emit('load'))

  expect(onError).toHaveBeenCalledOnce()
})

it('informa error recuperable cuando el mapa supera el timeout', async () => {
  const onError = vi.fn()
  render(<OpenFreeMapLayer onReady={vi.fn()} onError={onError} timeoutMs={1200} />)
  await act(async () => {})

  await act(async () => vi.advanceTimersByTime(1200))

  expect(onError).toHaveBeenCalledWith('Tiempo de espera agotado al cargar el mapa base.')
})
