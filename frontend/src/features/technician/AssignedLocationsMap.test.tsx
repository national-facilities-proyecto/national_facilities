import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mapMocks = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload?: unknown) => void>>()
  const add = (event: string, callback: (payload?: unknown) => void) => {
    const callbacks = listeners.get(event) ?? new Set<(payload?: unknown) => void>()
    callbacks.add(callback)
    listeners.set(event, callbacks)
  }
  const remove = (event: string, callback: (payload?: unknown) => void) => listeners.get(event)?.delete(callback)
  const maplibreMap = {
    loaded: vi.fn(() => false),
    isStyleLoaded: vi.fn(() => false),
    once: vi.fn(add),
    on: vi.fn(add),
    off: vi.fn(remove),
  }
  const layer = { addTo: vi.fn(() => layer), getMaplibreMap: vi.fn(() => maplibreMap), remove: vi.fn() }
  return { listeners, maplibreMap, layer, maplibreGL: vi.fn(() => layer), emit: (event: string, payload?: unknown) => listeners.get(event)?.forEach((callback) => callback(payload)) }
})

vi.mock('react-leaflet', () => ({ useMap: () => ({}), AttributionControl: () => null, MapContainer: () => null, Marker: () => null, Popup: () => null }))
vi.mock('@maplibre/maplibre-gl-leaflet', () => ({ maplibreGL: mapMocks.maplibreGL }))

import { OpenFreeMapLayer } from './AssignedLocationsMap'

beforeEach(() => {
  vi.useFakeTimers()
  mapMocks.listeners.clear()
  mapMocks.maplibreMap.loaded.mockReturnValue(false)
  mapMocks.maplibreMap.isStyleLoaded.mockReturnValue(false)
  mapMocks.maplibreGL.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('transiciona de loading a ready cuando MapLibre emite load', () => {
  const onReady = vi.fn()
  render(<OpenFreeMapLayer onReady={onReady} onError={vi.fn()} timeoutMs={1000} />)
  expect(onReady).not.toHaveBeenCalled()

  act(() => mapMocks.emit('load'))

  expect(onReady).toHaveBeenCalledOnce()
})

it('informa error recuperable cuando el estilo supera el timeout', () => {
  const onError = vi.fn()
  render(<OpenFreeMapLayer onReady={vi.fn()} onError={onError} timeoutMs={1200} />)

  act(() => vi.advanceTimersByTime(1200))

  expect(onError).toHaveBeenCalledWith('Tiempo de espera agotado al cargar el mapa base.')
})
