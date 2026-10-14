import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { renderPage } from '../../test/render'
import { createMockRepositories } from '../../test/doubles/repositories'
import { AppError } from '../../services/errors'
import TemplateEditorPage from './TemplateEditorPage'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})

async function editor() {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 4 })
  const save = vi.spyOn(repos.administration, 'save')
  const view = renderPage(<TemplateEditorPage />, repos, '/admin/templates/new')
  await screen.findByRole('heading', { name: 'Nueva plantilla' })
  return { ...view, save }
}

it('impide salir con un borrador, permite continuar y protege también la recarga', async () => {
  const { router, save } = await editor()
  fireEvent.change(screen.getByLabelText('Nombre de plantilla'), {
    target: { value: 'Mi borrador' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Agregar ítem' }))
  fireEvent.change(screen.getByLabelText('Ítem 1', { exact: true }), {
    target: { value: 'Revisar filtro' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  await screen.findByRole('dialog', { name: 'Cambios sin guardar' })
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))
  expect(screen.getByLabelText('Ítem 1', { exact: true })).toHaveValue('Revisar filtro')
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  expect(router.state.location.pathname).toBe('/admin/templates/new')
  expect(save).not.toHaveBeenCalled()
})

it('conserva los campos y los ítems si la API rechaza el guardado y permite reintentar', async () => {
  const { save, router } = await editor()
  fireEvent.change(screen.getByLabelText('Nombre de plantilla'), {
    target: { value: 'Nombre existente' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Agrega al menos un ítem')
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Agregar ítem' }))
  fireEvent.change(screen.getByLabelText('Ítem 1', { exact: true }), {
    target: { value: 'Mi tarea' },
  })
  fireEvent.click(screen.getByLabelText('Foto obligatoria del ítem 1', { exact: true }))
  save.mockRejectedValueOnce(
    new AppError('validation', 'El nombre ya existe.', { name: ['El nombre ya existe.'] }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }))
  await screen.findByRole('region', { name: 'Revisión de la plantilla' })
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar' }))
  await waitFor(() =>
    expect(screen.getByLabelText('Nombre de plantilla')).toHaveAttribute('aria-invalid', 'true'),
  )
  expect(screen.getByLabelText('Nombre de plantilla')).toHaveValue('Nombre existente')
  expect(screen.getByLabelText('Ítem 1', { exact: true })).toHaveValue('Mi tarea')
  expect(screen.getByLabelText('Foto obligatoria del ítem 1', { exact: true })).not.toBeChecked()
  fireEvent.change(screen.getByLabelText('Nombre de plantilla'), {
    target: { value: 'Nombre nuevo' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/admin/templates'))
  expect(save).toHaveBeenCalledTimes(2)
})
