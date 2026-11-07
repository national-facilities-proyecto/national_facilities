import type { ReactNode } from 'react'
import L from 'leaflet'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { VectorMapLayer } from './vectorTileTransport'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mocks = vi.hoisted(() => ({
  primary: vi.fn(),
  markerMount: vi.fn(),
  map: { fitBounds: vi.fn(), invalidateSize: vi.fn(), getContainer: () => document.body },
}))
vi.mock('./openFreeMap', () => ({
  createOpenFreeMapLayer: mocks.primary,
}))
vi.mock('react-leaflet', async () => {
  const { useEffect } = await import('react')
  return {
    useMap: () => mocks.map,
    GeoJSON: () => <div data-testid="local-layer" />,
    MapContainer: ({ children }: { children: ReactNode }) => (
      <div data-testid="map">{children}</div>
    ),
    Marker: ({
      children,
      title,
      position,
    }: {
      children: ReactNode
      title: string
      position: number[]
    }) => {
      useEffect(() => {
        mocks.markerMount(title)
      }, [title])
      return (
        <div data-testid="marker" data-position={JSON.stringify(position)} aria-label={title}>
          {children}
        </div>
      )
    },
    Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Tooltip: () => null,
    ZoomControl: () => <span>Zoom</span>,
    AttributionControl: ({ prefix }: { prefix: string }) => (
      <span data-testid="attribution">{prefix}</span>
    ),
  }
})
vi.mock('../geolocation/location', () => ({
  requestLocation: () => Promise.resolve({ latitude: -12.1, longitude: -77.1, accuracy: 5 }),
}))
import { AssignedLocationsMap } from './AssignedLocationsMap'

const stores = [
  {
    id: 1,
    name: 'Tienda piloto',
    address: 'Av. Principal, Miraflores, Lima',
    latitude: -12.1739,
    longitude: -77.0181,
  },
  { id: 2, name: 'Coordenada inválida', address: 'No enviar', latitude: NaN, longitude: 0 },
]
let primary: VectorMapLayer
function makeLayer() {
  const layer = new L.Layer() as VectorMapLayer
  layer.addTo = vi.fn(() => layer)
  layer.remove = vi.fn(() => layer)
  layer.dispose = vi.fn()
  return layer
}
const flush = () => act(async () => {})
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('No se pudo cargar la cartografía simplificada local.')),
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  primary = makeLayer()
  mocks.primary.mockReset().mockResolvedValue(primary)
  mocks.markerMount.mockClear()
  mocks.map.fitBounds.mockClear()
})

it('activa GeoJSON conservando mapa, marcadores y viewport y permite recuperar OpenFreeMap', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(
            readFileSync(resolve('src/features/technician/data/lima-pilot.geojson'), 'utf8'),
          ),
      ),
  )
  render(<AssignedLocationsMap stores={stores} />)
  await flush()
  const marker = screen.getByTestId('marker')
  const map = screen.getByTestId('map')
  act(() => {
    primary.fire('tileerror')
  })
  await flush()
  expect(screen.getByTestId('local-layer')).toBeVisible()
  expect(
    screen.getByText(
      'El mapa principal no está disponible. Se está utilizando cartografía simplificada',
    ),
  ).toBeVisible()
  expect(screen.getByTestId('marker')).toBe(marker)
  expect(screen.getByTestId('map')).toBe(map)
  expect(mocks.map.fitBounds).toHaveBeenCalledOnce()
  expect(primary.remove).toHaveBeenCalledOnce()
  const recovered = makeLayer()
  mocks.primary.mockResolvedValueOnce(recovered)
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar mapa principal' }))
  await flush()
  act(() => {
    recovered.fire('load')
  })
  expect(screen.queryByTestId('local-layer')).not.toBeInTheDocument()
  expect(mocks.primary).toHaveBeenCalledTimes(2)
})
afterEach(() => vi.unstubAllGlobals())

it('conserva el mapa, los marcadores, coordenadas, GPS y controles ante un fallo recuperable', async () => {
  render(<AssignedLocationsMap stores={stores} />)
  await flush()
  const map = screen.getByTestId('map')
  const storeMarker = screen.getByTestId('marker')
  fireEvent.click(screen.getByRole('button', { name: 'Mi ubicación' }))
  await flush()
  expect(screen.getAllByTestId('marker')).toHaveLength(2)
  act(() => {
    primary.fire('tileerror')
  })
  await flush()
  expect(screen.getByRole('alert')).toHaveTextContent('Mapa no disponible')
  expect(screen.getByTestId('map')).toBe(map)
  expect(screen.getAllByTestId('marker')[0]).toBe(storeMarker)
  expect(storeMarker).toHaveAttribute('data-position', '[-12.1739,-77.0181]')
  expect(screen.getAllByTestId('marker')[1]).toHaveAttribute('data-position', '[-12.1,-77.1]')
  expect(mocks.markerMount.mock.calls).toEqual([['Tienda piloto'], ['Tu ubicación']])
  expect(screen.queryByLabelText('Coordenada inválida')).not.toBeInTheDocument()
  expect(screen.getByText('Zoom')).toBeVisible()
  expect(screen.getByTestId('attribution')).toHaveTextContent('OpenFreeMap')
  // Solo montaje y GPS ajustaron bounds; el fallo no alteró el viewport.
  expect(mocks.map.fitBounds).toHaveBeenCalledTimes(2)
})

it('mantiene una lista utilizable al fallar el mapa y el botón reintenta OpenFreeMap', async () => {
  render(<AssignedLocationsMap stores={stores} />)
  await flush()
  act(() => {
    primary.fire('tileerror')
  })
  await flush()
  expect(screen.getByRole('alert')).toHaveTextContent('Mapa no disponible')
  const list = screen.getByRole('list', { name: 'Tiendas asignadas sin mapa' })
  expect(within(list).getByText(stores[0].name)).toBeVisible()
  expect(within(list).getByText(stores[0].address)).toBeVisible()
  expect(within(list).getByRole('link')).toHaveAttribute(
    'href',
    'https://www.google.com/maps/dir/?api=1&destination=-12.1739,-77.0181',
  )
  const recovered = makeLayer()
  mocks.primary.mockResolvedValueOnce(recovered)
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar mapa' }))
  await flush()
  act(() => {
    recovered.fire('load')
  })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(mocks.primary).toHaveBeenCalledTimes(2)
})
