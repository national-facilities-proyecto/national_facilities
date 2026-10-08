import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ChecklistPhotos } from './ChecklistPhotos'
import { checklistPhotos } from '../../services/checklistPhotos'
import type { Evidence } from '../../types/models'
import { Blob as StructuredBlob } from 'node:buffer'
import { AppError } from '../../services/errors'

const photo: Evidence = {
  id: 'walkthrough-photo',
  name: 'walkthrough.jpg',
  mimeType: 'image/jpeg',
  size: 5,
  source: 'camera',
  capturedAt: '2026-10-04T10:00:00.000Z',
  blob: new StructuredBlob(['photo']) as Blob,
}
vi.mock('../technician/CameraModal', () => ({
  CameraModal: ({
    open,
    onCapture,
  }: {
    open: boolean
    onCapture: (photo: Evidence) => Promise<void>
  }) =>
    open ? <button onClick={() => void onCapture(photo)}>Confirmar foto del test</button> : null,
}))

it('recupera fotos temporales históricas de atención y sube al asociar a resolución', async () => {
  const scope = crypto.randomUUID()
  const associate = vi.fn().mockResolvedValue(undefined)
  const view = render(<ChecklistPhotos scope={scope} />)
  fireEvent.click(screen.getByRole('button', { name: 'Tomar fotografía de la atención' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar foto del test' }))
  await screen.findByAltText('Fotografía pendiente de asociación')
  expect(associate).not.toHaveBeenCalled()
  expect(await checklistPhotos.list(scope)).toHaveLength(1)
  view.unmount()
  render(<ChecklistPhotos scope={scope} onAssociate={associate} />)
  await screen.findByAltText('Fotografía pendiente de asociación')
  fireEvent.click(screen.getByRole('button', { name: 'Asociar fotografía' }))
  await waitFor(() =>
    expect(associate).toHaveBeenCalledWith(expect.objectContaining({ id: photo.id })),
  )
  await waitFor(() =>
    expect(screen.queryByAltText('Fotografía pendiente de asociación')).not.toBeInTheDocument(),
  )
  expect(await checklistPhotos.list(scope)).toEqual([])
})

it('conserva la foto cuando falla la subida y permite reintentar', async () => {
  const scope = crypto.randomUUID()
  await checklistPhotos.put(scope, photo)
  const associate = vi
    .fn()
    .mockRejectedValueOnce(new AppError('network', 'Sin conexión'))
    .mockResolvedValue(undefined)
  render(<ChecklistPhotos scope={scope} onAssociate={associate} />)
  await screen.findByAltText('Fotografía pendiente de asociación')
  fireEvent.click(screen.getByRole('button', { name: 'Asociar fotografía' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
  expect(await checklistPhotos.list(scope)).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Asociar fotografía' }))
  await waitFor(() =>
    expect(screen.queryByAltText('Fotografía pendiente de asociación')).not.toBeInTheDocument(),
  )
})
