import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { renderPage } from '../test/render'
import { createMockRepositories } from '../test/doubles/repositories'
import { VisitEditor } from '../features/checklists/VisitEditor'
import 'fake-indexeddb/auto'
import { vi } from 'vitest'
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
async function page() {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  await repos.checklists.claim(1)
  const store = await repos.stores.get(1)
  await repos.visits.start(1, { ...store, accuracy: 8, capturedAt: Date.now() })
  await repos.visits.openForm?.(1, { ...store, accuracy: 8, capturedAt: Date.now() })
  renderPage(<VisitEditor id={1} origin="checklist" />, repos)
  await screen.findByText('Finalizar checklist')
  return repos
}
it('bloquea finalización sin resultados ni fotografías', async () => {
  await page()
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar checklist' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Resultado pendiente')
  expect(screen.getByRole('alert')).toHaveTextContent('Fotografía obligatoria')
})
it('sincroniza observaciones entre tareas y guarda el borrador', async () => {
  const repos = await page()
  fireEvent.click(screen.getAllByRole('button', { name: '! No conforme' })[0])
  expect(screen.getByRole('button', { name: 'Guardar observación' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Descripción obligatoria'), {
    target: { value: 'Filtro dañado' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar observación' }))
  fireEvent.click(screen.getAllByRole('button', { name: '! No conforme' })[1])
  expect(screen.getByLabelText('Descripción obligatoria')).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  await waitFor(async () =>
    expect((await repos.checklists.get(1)).answers[0]?.observation).toBe('Filtro dañado'),
  )
})

it('muestra tareas y cámara sin formulario ni plazo durante el trabajo físico', async () => {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  await repos.checklists.claim(1)
  const store = await repos.stores.get(1)
  await repos.visits.start(1, { ...store, accuracy: 8, capturedAt: Date.now() })
  renderPage(<VisitEditor id={1} origin="checklist" />, repos)
  await screen.findByRole('heading', { name: 'Trabajo en ejecución' })
  const visit = await repos.visits.get(1)
  expect(visit.status).toBe('in_progress')
  expect(visit.formOpenedAt).toBeUndefined()
  expect(visit.expiresAt).toBeUndefined()
  for (const task of visit.tasks) expect(screen.getByText(task.title)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Tomar fotografía del recorrido' })).toBeVisible()
  expect(screen.queryByRole('button', { name: '✓ Conforme' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Tiempo de registro del formulario' })).not.toBeInTheDocument()
  const getCurrentPosition = vi.fn((success: PositionCallback) => success({
    coords: { latitude: store.latitude, longitude: store.longitude, accuracy: 8 }, timestamp: Date.now(),
  } as GeolocationPosition))
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } })
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar checklist' }))
  await screen.findByRole('region', { name: 'Tiempo de registro del formulario' })
  const opened = await repos.visits.get(1)
  expect(Date.parse(opened.expiresAt!) - Date.parse(opened.formOpenedAt!)).toBe(300000)
  expect(getCurrentPosition).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Reporte general del checklist')).toBeVisible()
})

it('conserva las fotos y permite el flujo de justificación cuando el GPS no está disponible', async () => {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  await repos.checklists.claim(1)
  const store = await repos.stores.get(1)
  await repos.visits.start(1, { ...store, accuracy: 8, capturedAt: Date.now() })
  const open = vi.spyOn(repos.visits, 'openForm')
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: vi.fn((_success: PositionCallback, failure: PositionErrorCallback) => failure({ code: 1 } as GeolocationPositionError)) },
  })
  renderPage(<VisitEditor id={1} origin="checklist" />, repos)
  await screen.findByRole('heading', { name: 'Trabajo en ejecución' })
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar checklist' }))
  await screen.findByRole('button', { name: 'Continuar al formulario sin GPS' })
  expect((await repos.visits.get(1)).formOpenedAt).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: 'Continuar al formulario sin GPS' }))
  await screen.findByRole('region', { name: 'Tiempo de registro del formulario' })
  expect(open).toHaveBeenCalledWith(1, undefined, 'denied')
  expect((await repos.visits.get(1)).status).toBe('in_progress')
  expect((await repos.visits.get(1)).endLocation).toBeUndefined()
})
