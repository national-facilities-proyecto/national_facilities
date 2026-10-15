import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { renderPage } from '../../test/render'
import { createMockRepositories } from '../../test/doubles/repositories'
import { AppError } from '../../services/errors'
import SpecialtiesPage from './SpecialtiesPage'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

async function setup() {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 4 })
  const save = vi.spyOn(repos.administration, 'save')
  const view = renderPage(<SpecialtiesPage />, repos, '/admin/specialties')
  await screen.findByLabelText('Cliente')
  return { ...view, save }
}

it('selecciona explícitamente el cliente y conserva las selecciones si se cancela una salida', async () => {
  const { save, router } = await setup()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: '1' } })
  expect(screen.getByLabelText('Eléctrico')).toBeChecked()
  fireEvent.click(screen.getByLabelText('Eléctrico'))
  fireEvent.click(screen.getByRole('button', { name: 'Catálogo de especialidades' }))
  await screen.findByRole('dialog', { name: 'Cambios sin guardar' })
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))
  expect(screen.getByLabelText('Eléctrico')).not.toBeChecked()
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  await router.navigate('/admin/users')
  await screen.findByRole('dialog', { name: 'Cambios sin guardar' })
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  await screen.findByText(/Se actualizaron las especialidades/)
  expect(save).toHaveBeenCalledWith('clientSpecialties', {
    id: 2,
    clientId: 1,
    categoryId: 2,
    active: false,
  })
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
})

it('explica un guardado parcial y al reintentar guarda únicamente los cambios pendientes', async () => {
  const { save } = await setup()
  fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: '1' } })
  fireEvent.click(screen.getByLabelText('Climatización'))
  fireEvent.click(screen.getByLabelText('Eléctrico'))
  const actualSave = save.getMockImplementation()!
  save
    .mockImplementationOnce(actualSave)
    .mockRejectedValueOnce(new AppError('network', 'Sin conexión.'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  await screen.findByText(/Se guardó 1 cambio/)
  expect(screen.getByLabelText('Climatización')).not.toBeChecked()
  expect(screen.getByLabelText('Eléctrico')).not.toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  await screen.findByText(/Se actualizaron las especialidades/)
  expect(save).toHaveBeenCalledTimes(3)
  expect(save.mock.calls[2]).toEqual([
    'clientSpecialties',
    { id: 2, clientId: 1, categoryId: 2, active: false },
  ])
  // Re-enable the saved pair: it must update its ID rather than create a duplicate.
  fireEvent.click(screen.getByLabelText('Eléctrico'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(4))
  expect(save.mock.calls[3]).toEqual([
    'clientSpecialties',
    { id: 2, clientId: 1, categoryId: 2, active: true },
  ])
})

it('explica el alcance global al desactivar y no habilita automáticamente una especialidad nueva', async () => {
  const { save } = await setup()
  fireEvent.click(screen.getByRole('button', { name: 'Catálogo de especialidades' }))
  fireEvent.click(screen.getByRole('button', { name: 'Editar Eléctrico' }))
  fireEvent.click(screen.getByLabelText('Especialidad activa'))
  expect(screen.getByRole('dialog')).toHaveTextContent('Afectará a 1 cliente')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar especialidad' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Nueva especialidad' }))
  fireEvent.change(screen.getByLabelText('Nombre de especialidad'), {
    target: { value: 'Gasfitería' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar especialidad' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(save.mock.calls.every(([kind]) => kind === 'specialties')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Por cliente' }))
  fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: '1' } })
  expect(screen.queryByLabelText('Eléctrico')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Gasfitería')).not.toBeChecked()
})

it('conserva cambios ajenos en especialidades que el administrador no modificó', async () => {
  const { repos, save } = await setup()
  fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: '1' } })
  fireEvent.click(screen.getByLabelText('Climatización'))
  await repos.administration.save('clientSpecialties', {
    id: 2,
    clientId: 1,
    categoryId: 2,
    active: false,
  })
  save.mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  await screen.findByText(/Se actualizaron las especialidades/)
  expect(save).toHaveBeenCalledTimes(1)
  expect(save).toHaveBeenCalledWith('clientSpecialties', {
    id: 1,
    clientId: 1,
    categoryId: 1,
    active: false,
  })
  expect(screen.getByLabelText('Eléctrico')).not.toBeChecked()
})
