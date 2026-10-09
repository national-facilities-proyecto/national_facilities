import 'fake-indexeddb/auto'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Evidence } from '../types/models'
import { AppError } from '../services/errors'
import * as images from '../services/optimizeEvidenceImage'
import { createMockRepositories } from '../test/doubles/repositories'
import { renderPage } from '../test/render'
import SupervisorNewTicketPage from './SupervisorNewTicketPage'
import { VisitEditor } from '../features/checklists/VisitEditor'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
async function setup(userId = 2) {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId })
  const files = new Map<string, Evidence>()
  repos.evidence = {
    listTemporary: async () => [],
    get: async (id) => files.get(id),
    put: async (photo) => {
      if (photo.replaceId) files.delete(photo.replaceId)
      files.set(photo.id, photo)
    },
    remove: async (id) => {
      files.delete(id)
    },
  }
  const optimized = new File(['webp'], 'foto.webp', { type: 'image/webp' })
  const optimize = vi.spyOn(images, 'optimizeEvidenceImage').mockResolvedValue(optimized)
  return { repos, optimized, optimize, put: vi.spyOn(repos.evidence, 'put') }
}

it('galería del reporte sube WebP y el reintento conserva archivo e ID sin comprimir otra vez', async () => {
  const { repos, optimized, optimize, put } = await setup()
  put.mockRejectedValueOnce(new AppError('network', 'Conexión interrumpida.'))
  renderPage(<SupervisorNewTicketPage />, repos)
  await screen.findByRole('button', { name: 'Seleccionar fotografías' })
  const source = new File(['jpeg'], 'foto.jpg', { type: 'image/jpeg' })
  fireEvent.change(screen.getByLabelText('Fotografías del reporte'), {
    target: { files: [source] },
  })
  await waitFor(() => expect(put).toHaveBeenCalledOnce())
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Reintentar carga' })).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar carga' }))
  await screen.findByRole('img', { name: 'foto.webp' })
  expect(optimize).toHaveBeenCalledExactlyOnceWith(source)
  expect(put).toHaveBeenCalledTimes(2)
  expect(put.mock.calls[0][0]).toEqual(put.mock.calls[1][0])
  expect(put.mock.calls[1][0].blob).toBe(optimized)
  expect(put.mock.calls[1][0]).toMatchObject({
    name: 'foto.webp',
    mimeType: 'image/webp',
    source: 'gallery',
    size: optimized.size,
  })
})
it('galería rechaza un archivo no decodificable sin subirlo y permite otra selección', async () => {
  const { repos, optimize, put } = await setup()
  optimize.mockRejectedValueOnce(
    new AppError('validation', 'No se pudo decodificar la imagen seleccionada.'),
  )
  renderPage(<SupervisorNewTicketPage />, repos)
  await screen.findByRole('button', { name: 'Seleccionar fotografías' })
  fireEvent.change(screen.getByLabelText('Fotografías del reporte'), {
    target: { files: [new File(['broken'], 'broken.jpg', { type: 'image/jpeg' })] },
  })
  await screen.findByText('No se pudo decodificar la imagen seleccionada.')
  expect(put).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Seleccionar fotografías' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Reintentar carga' })).not.toBeInTheDocument()
})
it('reemplazo fallido conserva original y reintenta con el mismo archivo e ID', async () => {
  const { repos, put } = await setup()
  const remove = vi.spyOn(repos.evidence, 'remove')
  renderPage(<SupervisorNewTicketPage />, repos)
  await screen.findByRole('button', { name: 'Seleccionar fotografías' })
  const files = () => ({
    target: { files: [new File(['jpeg'], 'foto.jpg', { type: 'image/jpeg' })] },
  })
  fireEvent.change(screen.getByLabelText('Fotografías del reporte'), files())
  await screen.findByRole('img', { name: 'foto.webp' })
  put.mockRejectedValueOnce(new AppError('network', 'No se confirmó el reemplazo.'))
  fireEvent.click(screen.getByRole('button', { name: 'Reemplazar fotografía' }))
  fireEvent.change(screen.getByLabelText('Fotografías del reporte'), files())
  await screen.findByText('No se confirmó el reemplazo.')
  expect(put).toHaveBeenCalledTimes(2)
  const original = put.mock.calls[0][0].id
  const replacement = put.mock.calls[1][0].id
  expect(await repos.evidence.get(original)).toBeDefined()
  expect(await repos.evidence.get(replacement)).toBeUndefined()
  expect(put.mock.calls[1][0].replaceId).toBe(original)
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar carga' }))
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Reintentar carga' })).not.toBeInTheDocument(),
  )
  expect(put).toHaveBeenCalledTimes(3)
  expect(put.mock.calls[1][0]).toEqual(put.mock.calls[2][0])
  expect(remove).not.toHaveBeenCalled()
  expect(await repos.evidence.get(original)).toBeUndefined()
  expect(await repos.evidence.get(replacement)).toBeDefined()
  expect(screen.getAllByRole('img', { name: 'foto.webp' })).toHaveLength(1)
})
it('galería del editor asocia solo el File WebP optimizado y mantiene source gallery', async () => {
  const { repos, optimized, optimize, put } = await setup(1)
  await repos.checklists.claim(1)
  const store = await repos.stores.get(1)
  const gps = { ...store, accuracy: 8, capturedAt: Date.now() }
  await repos.visits.start(1, gps)
  await repos.visits.finishPhysicalWork(1)
  await repos.visits.openForm(1)
  const view = renderPage(<VisitEditor id={1} origin="checklist" />, repos)
  await screen.findAllByRole('button', { name: 'Conforme' })
  fireEvent.click(screen.getAllByRole('button', { name: 'Conforme' })[0])
  const buttons = await screen.findAllByRole('button', { name: 'Seleccionar de galería' })
  fireEvent.click(buttons[0])
  const source = new File(['png'], 'foto.png', { type: 'image/png' })
  fireEvent.change(view.container.querySelector('input[type="file"]')!, {
    target: { files: [source] },
  })
  await screen.findByRole('img', { name: 'foto.webp' })
  expect(optimize).toHaveBeenCalledExactlyOnceWith(source)
  expect(put).toHaveBeenCalledOnce()
  expect(put.mock.calls[0][0].blob).toBe(optimized)
  expect(put.mock.calls[0][0]).toMatchObject({
    mimeType: 'image/webp',
    name: 'foto.webp',
    source: 'gallery',
    visitId: 1,
  })
  await waitFor(async () =>
    expect((await repos.visits.get(1)).answers[0].evidenceIds).toContain(put.mock.calls[0][0].id),
  )
})
