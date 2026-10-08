import 'fake-indexeddb/auto'
import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMockRepositories } from '../../test/doubles/repositories'
import { renderPage } from '../../test/render'
import { AppError } from '../../services/errors'
import { VisitEditor } from './VisitEditor'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
async function setup() {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  const store = await repos.stores.get(1)
  await repos.visits.start(101, { ...store, accuracy: 8, capturedAt: Date.now() })
  return repos
}
it('un clic confirma fin físico y apertura; resultados compactos con validación por campo', async () => {
  const repos = await setup()
  const end = vi.spyOn(repos.visits, 'finishPhysicalWork')
  const open = vi.spyOn(repos.visits, 'openForm')
  renderPage(<VisitEditor id={101} origin="ticket" />, repos)
  fireEvent.click(await screen.findByRole('button', { name: 'Registrar resultado del trabajo' }))
  await screen.findByLabelText('Descripción del trabajo realizado')
  expect(end).toHaveBeenCalledExactlyOnceWith(101)
  expect(open).toHaveBeenCalledExactlyOnceWith(101)
  expect(end.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0])
  expect(screen.getByText('Agrega al menos una fotografía del trabajo.')).toBeVisible()
  expect(screen.queryByText(/requisitos pendientes/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Guardar borrador' })).not.toBeInTheDocument()
  expect(screen.queryByText('Borrador guardado.')).not.toBeInTheDocument()
  expect(screen.queryByText('No hay fotografías pendientes de asociación.')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'No pude realizar el trabajo' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Enviar registro' })).toBeVisible()
})
it('fin físico fallido no abre formulario; reintento confirma ambos pasos', async () => {
  const repos = await setup()
  const end = vi
    .spyOn(repos.visits, 'finishPhysicalWork')
    .mockRejectedValueOnce(new AppError('network', 'Fin no confirmado.'))
  const open = vi.spyOn(repos.visits, 'openForm')
  renderPage(<VisitEditor id={101} origin="ticket" />, repos)
  fireEvent.click(await screen.findByRole('button', { name: 'Registrar resultado del trabajo' }))
  await screen.findByText('Fin no confirmado.')
  expect(open).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('Descripción del trabajo realizado')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Registrar resultado del trabajo' }))
  await screen.findByLabelText('Descripción del trabajo realizado')
  expect(end).toHaveBeenCalledTimes(2)
  expect(open).toHaveBeenCalledOnce()
})
it('recarga tras apertura fallida conserva fin físico y recupera sin repetirlo', async () => {
  const repos = await setup()
  const end = vi.spyOn(repos.visits, 'finishPhysicalWork')
  const open = vi
    .spyOn(repos.visits, 'openForm')
    .mockRejectedValueOnce(new AppError('network', 'No se abrió el registro.'))
  const view = renderPage(<VisitEditor id={101} origin="ticket" />, repos)
  fireEvent.click(await screen.findByRole('button', { name: 'Registrar resultado del trabajo' }))
  await screen.findByText('No se abrió el registro.')
  const ended = (await repos.visits.get(101)).physicalEndedAt
  expect(ended).toBeDefined()
  view.unmount()
  renderPage(<VisitEditor id={101} origin="ticket" />, repos)
  fireEvent.click(await screen.findByRole('button', { name: 'Registrar resultado del trabajo' }))
  await screen.findByLabelText('Descripción del trabajo realizado')
  expect(end).toHaveBeenCalledOnce()
  expect(open).toHaveBeenCalledTimes(2)
  expect((await repos.visits.get(101)).physicalEndedAt).toBe(ended)
})
