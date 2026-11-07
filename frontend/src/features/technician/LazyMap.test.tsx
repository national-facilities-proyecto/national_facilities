import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('./AssignedLocationsMap', () => {
  throw new Error('Synthetic module load failure')
})
import { LazyMap } from './LazyMap'
import { MapFailureBoundary } from './MapFailureBoundary'
const expectedBoundaryError = (event: ErrorEvent) => {
  if (
    event.message.includes('Synthetic') ||
    event.message.includes('[vitest] There was an error when mocking a module')
  )
    event.preventDefault()
}
beforeEach(() => window.addEventListener('error', expectedBoundaryError))
afterEach(() => window.removeEventListener('error', expectedBoundaryError))
it('mantiene las tiendas y sus direcciones accesibles aunque falle el chunk del visor', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  render(
    <LazyMap
      stores={[
        {
          id: 1,
          name: 'Store fixture',
          address: 'Address fixture',
          latitude: -12.17,
          longitude: -77.02,
        },
        {
          id: 2,
          name: 'Invalid coordinates fixture',
          address: 'Second fixture',
          latitude: NaN,
          longitude: 0,
        },
      ]}
    />,
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo abrir el visor')
  const list = screen.getByRole('list', { name: 'Tiendas asignadas sin mapa' })
  expect(within(list).getByText('Store fixture')).toBeVisible()
  expect(within(list).getByText('Invalid coordinates fixture')).toBeVisible()
  expect(within(list).getAllByRole('link')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Recargar y reintentar' })).toBeVisible()
})
it('un error de representación GeoJSON se comunica una sola vez sin mantener su subárbol', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const onError = vi.fn()
  function BrokenLayer(): never {
    throw new Error('Synthetic layer construction error')
  }
  const view = render(
    <MapFailureBoundary onError={onError}>
      <BrokenLayer />
    </MapFailureBoundary>,
  )
  expect(onError).toHaveBeenCalledExactlyOnceWith(
    'No se pudo representar la cartografía simplificada.',
  )
  expect(view.container).toBeEmptyDOMElement()
})
