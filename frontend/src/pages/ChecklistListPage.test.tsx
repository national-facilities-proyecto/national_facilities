import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChecklistListPage from './ChecklistListPage'
import { renderPage } from '../test/render'
import { createFixtures } from '../test/doubles/fixtures'
import { createMockRepositories } from '../test/doubles/repositories'
import type { Store, Visit, VisitStatus } from '../types/models'

vi.mock('../features/checklists/WorkRecovery', () => ({ WorkRecovery: () => null }))
vi.mock('../features/technician/LazyMap', () => ({
  LazyMap: ({ stores, onSelect }: { stores: Store[]; onSelect: (store: Store) => void }) => (
    <section aria-label="Mapa de tiendas">
      {stores.map((store) => (
        <button key={store.id} onClick={() => onSelect(store)}>
          {store.name}
        </button>
      ))}
    </section>
  ),
}))

const stores = createFixtures().stores
function visit(id: number, status: VisitStatus, storeId = stores[0].id): Visit {
  return { ...createFixtures().visits[0], id, status, storeId, storeSnapshot: undefined }
}
async function setup(visits: Visit[], catalog = stores) {
  const repos = createMockRepositories()
  repos.checklists.generate = vi.fn().mockResolvedValue(undefined)
  vi.spyOn(repos.checklists, 'list').mockResolvedValue(visits)
  vi.spyOn(repos.stores, 'list').mockResolvedValue(catalog)
  const result = renderPage(<ChecklistListPage />, repos)
  await screen.findByRole('heading', { name: 'Mis Checklist' })
  return result
}

describe('Mapa general de Mis Checklist', () => {
  beforeEach(() => localStorage.clear())

  it('conserva las tiendas finalizadas en todas las pestañas', async () => {
    await setup([visit(10, 'completed'), visit(11, 'completed', stores[1].id)])
    for (const tab of ['Bolsa compartida', 'Mis trabajos', 'En revisión', 'Finalizados']) {
      fireEvent.click(screen.getByRole('button', { name: tab }))
      expect(screen.getByRole('region', { name: 'Mapa de tiendas' })).toBeVisible()
      for (const store of stores)
        expect(screen.getByRole('button', { name: store.name })).toBeVisible()
    }
  })

  it('agrupa cuotas y entradas duplicadas por tienda y abre una finalizada', async () => {
    const { router } = await setup(
      [visit(10, 'completed'), visit(11, 'completed')],
      [stores[0], stores[0]],
    )
    expect(screen.getAllByRole('button', { name: stores[0].name })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: stores[0].name }))
    expect(router.state.location.pathname).toBe('/checklists/10')
  })

  it.each<VisitStatus>([
    'available',
    'claimed',
    'in_progress',
    'correction_required',
    'pending_approval',
  ])('prioriza %s sobre una visita finalizada incluso desde Finalizados', async (status) => {
    const { router } = await setup([visit(10, 'completed'), visit(12, status)])
    fireEvent.click(screen.getByRole('button', { name: 'Finalizados' }))
    fireEvent.click(screen.getByRole('button', { name: stores[0].name }))
    expect(router.state.location.pathname).toBe('/checklists/12')
  })

  it('prioriza retomar un trabajo activo sobre tomar otro disponible', async () => {
    const { router } = await setup([visit(10, 'available'), visit(12, 'in_progress')])
    fireEvent.click(screen.getByRole('button', { name: stores[0].name }))
    expect(router.state.location.pathname).toBe('/checklists/12')
  })

  it.each<Visit['phase']>(['physical_finished', 'results'])(
    'prioriza retomar la etapa %s antes de tomar otra visita disponible',
    async (phase) => {
      const { router } = await setup([
        visit(10, 'available'),
        { ...visit(12, 'pending_approval'), phase },
      ])
      fireEvent.click(screen.getByRole('button', { name: stores[0].name }))
      expect(router.state.location.pathname).toBe('/checklists/12')
    },
  )

  it('solo incluye tiendas con visitas checklist accesibles', async () => {
    await setup([
      visit(10, 'completed'),
      { ...visit(12, 'in_progress', stores[1].id), origin: 'ticket' },
    ])
    expect(screen.getByRole('button', { name: stores[0].name })).toBeVisible()
    expect(screen.queryByRole('button', { name: stores[1].name })).not.toBeInTheDocument()
  })

  it('usa el snapshot autorizado si falta la tienda en el catálogo actual', async () => {
    const { name, address, latitude, longitude, clientId } = stores[0]
    const { router } = await setup(
      [
        {
          ...visit(12, 'in_progress'),
          storeSnapshot: { name, address, latitude, longitude, clientId },
        },
      ],
      [],
    )
    fireEvent.click(screen.getByRole('button', { name }))
    expect(router.state.location.pathname).toBe('/checklists/12')
  })

  it.each(
    [
      [],
      [{ ...stores[0], latitude: NaN }],
      [{ ...stores[0], longitude: Infinity }],
      [{ ...stores[0], latitude: 91 }],
      [{ ...stores[0], longitude: -181 }],
    ].map((catalog) => ({ catalog })),
  )('explica la ausencia de ubicaciones válidas sin ocultar las visitas', async ({ catalog }) => {
    await setup([visit(10, 'completed')], catalog)
    expect(screen.getByText(/No hay ubicaciones válidas/)).toBeVisible()
    expect(screen.queryByRole('button', { name: stores[0].name })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Finalizados' }))
    expect(screen.getByRole('link', { name: 'Ver detalle' })).toHaveAttribute(
      'href',
      '/checklists/10',
    )
  })

  it('muestra el estado vacío cuando no hay visitas accesibles', async () => {
    await setup([])
    expect(screen.getByText(/No hay ubicaciones válidas/)).toBeVisible()
    expect(screen.queryByRole('button', { name: stores[0].name })).not.toBeInTheDocument()
  })

  it.each([
    { latitude: 0, longitude: 0 },
    { latitude: -90, longitude: 180 },
  ])('admite coordenadas válidas cero y límites geográficos', async (coordinates) => {
    await setup([visit(10, 'completed')], [{ ...stores[0], ...coordinates }])
    expect(screen.getByRole('button', { name: stores[0].name })).toBeVisible()
    expect(screen.queryByText(/No hay ubicaciones válidas/)).not.toBeInTheDocument()
  })

  it('descarta un snapshot sin coordenadas sin inventar una ubicación', async () => {
    const snapshot = { ...stores[0] }
    Reflect.set(snapshot, 'latitude', null)
    await setup([{ ...visit(10, 'completed'), storeSnapshot: snapshot }], [])
    expect(screen.getByText(/No hay ubicaciones válidas/)).toBeVisible()
  })
})
