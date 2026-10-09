import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChecklistListPage from './ChecklistListPage'
import { renderPage } from '../test/render'
import { createFixtures } from '../test/doubles/fixtures'
import { createMockRepositories } from '../test/doubles/repositories'
import type { Store, Visit, VisitStatus } from '../types/models'
vi.mock('../features/checklists/WorkRecovery', () => ({
  WorkRecovery: () => <section aria-label="Recuperación de trabajos" />,
}))
vi.mock('../features/technician/LazyMap', () => ({
  LazyMap: ({ stores }: { stores: Store[] }) => (
    <section aria-label="Mapa de tiendas">
      {stores.map((store) => (
        <p key={store.id}>{store.name}</p>
      ))}
    </section>
  ),
}))
const stores = createFixtures().stores
function visit(id: number, status: VisitStatus, technicianId = 1): Visit {
  return { ...createFixtures().visits[0], id, status, technicianId, storeSnapshot: undefined }
}
async function setup(visits: Visit[] = [], catalog = stores, failure = false) {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  repos.checklists.generate = vi.fn().mockResolvedValue(undefined)
  const list = vi.spyOn(repos.checklists, 'list')
  if (failure) list.mockRejectedValue(new Error('Offline'))
  else list.mockResolvedValue(visits)
  vi.spyOn(repos.stores, 'list').mockResolvedValue(catalog)
  const result = renderPage(<ChecklistListPage />, repos)
  await screen.findByRole('region', { name: 'Mapa de tiendas' })
  if (!failure) await screen.findByRole('button', { name: 'Bolsa compartida' })
  return result
}
const map = () => within(screen.getByRole('region', { name: 'Mapa de tiendas' }))
describe('Mis Checklist por cobertura y propietario', () => {
  beforeEach(() => localStorage.clear())
  it('muestra tiendas sin visitas debajo de recuperación y conserva el mapa en tres pestañas', async () => {
    await setup()
    expect(screen.getByText('No tienes checklists disponibles por ahora.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Mis trabajos' })).not.toBeInTheDocument()
    expect(
      screen
        .getByRole('region', { name: 'Recuperación de trabajos' })
        .compareDocumentPosition(screen.getByRole('region', { name: 'Mapa de tiendas' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    for (const tab of ['Bolsa compartida', 'En revisión', 'Finalizados']) {
      fireEvent.click(screen.getByRole('button', { name: tab }))
      for (const store of stores) expect(map().getByText(store.name)).toBeVisible()
    }
  })
  it('no deriva acceso de snapshots cuando el catálogo autorizado está vacío', async () => {
    await setup([{ ...visit(10, 'in_progress'), storeSnapshot: stores[0] }], [])
    expect(screen.getByText('No tienes tiendas asignadas por ahora.')).toBeVisible()
    for (const store of stores) expect(map().queryByText(store.name)).not.toBeInTheDocument()
  })
  it('descarta inactivas y agrupa por ID sin depender de cuotas', async () => {
    await setup(
      [visit(10, 'completed'), visit(11, 'completed')],
      [stores[0], stores[0], { ...stores[1], active: false }],
    )
    expect(map().getAllByText(stores[0].name)).toHaveLength(1)
    expect(map().queryByText(stores[1].name)).not.toBeInTheDocument()
  })
  it('Finalizados solo contiene visitas completadas por el técnico conectado', async () => {
    await setup([visit(10, 'completed'), visit(11, 'completed', 5), visit(12, 'available')])
    fireEvent.click(screen.getByRole('button', { name: 'Finalizados' }))
    const links = screen.getAllByRole('link', { name: 'Ver detalle' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/checklists/10')
  })
  it('En revisión exige propietario, envío y fase real de revisión', async () => {
    const review = {
      ...visit(10, 'pending_approval'),
      phase: 'in_review' as const,
      submittedAt: '2026-10-08T15:00:00Z',
    }
    await setup([
      review,
      { ...review, id: 11, technicianId: 5 },
      { ...review, id: 12, phase: 'results', submittedAt: undefined },
      { ...review, id: 13, submittedAt: undefined },
      visit(14, 'correction_required'),
    ])
    fireEvent.click(screen.getByRole('button', { name: 'En revisión' }))
    const links = screen.getAllByRole('link', { name: 'Ver detalle' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/checklists/10')
  })
  it('la bolsa solo muestra disponibles, no reservas ni trabajos activos', async () => {
    await setup([visit(10, 'available'), visit(11, 'claimed'), visit(12, 'in_progress')])
    const links = screen.getAllByRole('link', { name: 'Ver detalle' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/checklists/10')
  })
  it('un fallo de visitas no oculta las tiendas autorizadas', async () => {
    await setup([], stores, true)
    for (const store of stores) expect(map().getByText(store.name)).toBeVisible()
  })
  it.each([NaN, Infinity, 91].map((latitude) => ({ latitude })))(
    'explica ubicaciones no disponibles sin inventarlas: $latitude',
    async ({ latitude }) => {
      await setup([], [{ ...stores[0], latitude }])
      expect(
        screen.getByText('Tus tiendas asignadas aún no tienen una ubicación disponible.'),
      ).toBeVisible()
      expect(map().queryByText(stores[0].name)).not.toBeInTheDocument()
    },
  )
  it.each([
    { latitude: 0, longitude: 0 },
    { latitude: -90, longitude: 180 },
  ])('conserva coordenadas válidas cero y límites geográficos', async (coordinates) => {
    await setup([], [{ ...stores[0], ...coordinates }])
    expect(map().getByText(stores[0].name)).toBeVisible()
  })
})
