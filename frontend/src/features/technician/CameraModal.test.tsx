import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CameraModal } from './CameraModal'
import type { Evidence } from '../../types/models'

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
    callback(new Blob(['photo'], { type: 'image/webp' })),
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

it('captura WebP una sola vez, reduce a 1600px y conserva origen cámara', async () => {
  const onCapture = vi.fn<(photo: Evidence) => void>()
  const stop = vi.fn()
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
  })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:camera')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  const draw = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: draw,
  } as unknown as CanvasRenderingContext2D)
  const encode = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((callback) => callback(new Blob(['photo'], { type: 'image/webp' })))
  const view = render(<CameraModal open onClose={vi.fn()} onCapture={onCapture} />)
  await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce())
  const video = view.container.querySelector('video')!
  Object.defineProperty(video, 'videoWidth', { value: 2400 })
  Object.defineProperty(video, 'videoHeight', { value: 1800 })
  fireEvent.loadedMetadata(video)
  fireEvent.click(view.getByRole('button', { name: 'Capturar' }))
  fireEvent.click(await view.findByRole('button', { name: 'Confirmar foto' }))
  await waitFor(() => expect(onCapture).toHaveBeenCalledOnce())
  const photo = onCapture.mock.calls[0][0]
  expect(photo).toMatchObject({ mimeType: 'image/webp', source: 'camera' })
  expect(photo.name).toMatch(/\.webp$/)
  expect(photo.blob).toBeInstanceOf(File)
  expect(draw).toHaveBeenCalledWith(video, 0, 0, 1600, 1200)
  expect(encode).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 'image/webp', 0.82)
  expect(stop).toHaveBeenCalled()
})
