import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMockRepositories } from '../test/doubles/repositories'
import { renderPage } from '../test/render'
import { createFixtures } from '../test/doubles/fixtures'
import RoutesPage from './RoutesPage'

vi.mock('../features/technician/LazyMap', () => ({
  LazyMap: ({ stores }: { stores: { id: number }[] }) => (
    <section aria-label="Mapa de tiendas">
      {stores.map((store) => (
        <span key={store.id}>Marcador {store.id}</span>
      ))}
    </section>
  ),
}))
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

it('dos pestañas, pendientes cronológicas propias y mapa de cobertura sin depender de atenciones', async () => {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  const source = createFixtures().visits.find((visit) => visit.origin === 'ticket')!
  vi.spyOn(repos.visits, 'list').mockResolvedValue([
    { ...source, id: 901, phase: 'scheduled', scheduledAt: '2026-12-10T00:00:00-05:00' },
    { ...source, id: 902, phase: 'scheduled', scheduledAt: '2026-01-10T00:00:00-05:00' },
    { ...source, id: 903, technicianId: 5, status: 'completed' },
    { ...source, id: 904, status: 'completed' },
    {
      ...source,
      id: 905,
      phase: 'in_review',
      status: 'pending_approval',
      submittedAt: '2026-10-08T10:00:00Z',
    },
  ])
  renderPage(<RoutesPage />, repos)
  await screen.findByRole('button', { name: 'Pendientes' })
  expect(await screen.findByText('Marcador 1')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Futuras' })).not.toBeInTheDocument()
  const details = screen.getAllByRole('link', { name: 'Ver detalle' })
  expect(details.map((link) => link.getAttribute('href'))).toEqual(['/routes/902', '/routes/901'])
  fireEvent.click(screen.getByRole('button', { name: 'Finalizadas' }))
  expect(screen.getByRole('link', { name: 'Ver detalle' })).toHaveAttribute('href', '/routes/904')
  expect(screen.getByText('Marcador 1')).toBeVisible()
})

it('conserva el mapa autorizado cuando falla la consulta de atenciones', async () => {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  vi.spyOn(repos.visits, 'list').mockRejectedValue(new Error('Failure'))
  renderPage(<RoutesPage />, repos)
  await screen.findByText('Marcador 1')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pendientes' })).toBeVisible())
})

it('sin atenciones ni cobertura muestra estados vacíos sin snapshots fuera de alcance', async () => {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  vi.spyOn(repos.visits, 'list').mockResolvedValue([])
  vi.spyOn(repos.stores, 'list').mockResolvedValue([])
  renderPage(<RoutesPage />, repos)
  await screen.findByText('No tienes tiendas asignadas por ahora.')
  expect(await screen.findByText('No tienes atenciones pendientes por ahora.')).toBeVisible()
})
