import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { renderPage } from '../test/render'
import { createMockRepositories } from '../mocks/repositories'
import { VisitEditor } from '../features/checklists/VisitEditor'
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
