import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CameraModal } from './CameraModal'

afterEach(() => cleanup())

it('libera el stream al cerrar', async () => {
  const stop = vi.fn()
  const stream = { getTracks: () => [{ stop }] }
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  })
  const { rerender } = render(<CameraModal open onClose={vi.fn()} onCapture={vi.fn()} />)
  await Promise.resolve()
  rerender(<CameraModal open={false} onClose={vi.fn()} onCapture={vi.fn()} />)
  expect(stop).toHaveBeenCalled()
})

it('informa permiso de cámara denegado', async () => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) },
  })
  const { findByRole } = render(<CameraModal open onClose={vi.fn()} onCapture={vi.fn()} />)
  expect(await findByRole('alert')).toHaveTextContent('No se pudo abrir la cámara')
})

it('inicia una sesión de cámara nueva al cambiar de tarea después de confirmar una foto', async () => {
  const stream = { getTracks: () => [{ stop: vi.fn() }] }
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  })
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:captured'),
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['photo'], { type: 'image/jpeg' })),
  )

  const view = render(<CameraModal open onClose={vi.fn()} onCapture={vi.fn()} />)
  await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce())
  const video = view.container.querySelector('video') as HTMLVideoElement
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: 640 })
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: 480 })
  fireEvent.loadedMetadata(video)
  fireEvent.click(view.getByRole('button', { name: 'Capturar' }))
  await waitFor(() => expect(view.container.querySelector('img')).toBeInTheDocument())

  fireEvent.click(view.getByRole('button', { name: 'Repetir' }))
  await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2))
  expect(view.container.querySelector('video')).toBeInTheDocument()

  view.rerender(<CameraModal open={false} onClose={vi.fn()} onCapture={vi.fn()} />)
  view.rerender(<CameraModal open onClose={vi.fn()} onCapture={vi.fn()} />)
  await waitFor(() => expect(view.container.querySelector('video')).toBeInTheDocument())
  expect(view.container.querySelector('img')).not.toBeInTheDocument()
})
