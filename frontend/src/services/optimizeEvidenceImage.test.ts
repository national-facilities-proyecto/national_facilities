import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { evidenceImageFile, optimizeEvidenceImage } from './optimizeEvidenceImage'
import { validateFiles } from './evidence'

let width: number
let height: number
let decodeFails: boolean
let encoded: Blob | null
let dimensions: number[]
const drawImage = vi.fn()
const encode = vi.fn()
const revoke = vi.fn()
beforeEach(() => {
  width = 3200
  height = 2400
  decodeFails = false
  encoded = new Blob(['webp'], { type: 'image/webp' })
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = width
      naturalHeight = height
      onload?: () => void
      onerror?: () => void
      set src(_value: string) {
        queueMicrotask(() => (decodeFails ? this.onerror?.() : this.onload?.()))
      }
    },
  )
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:source')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback,
    type,
    quality,
  ) {
    dimensions = [this.width, this.height]
    encode(type, quality)
    callback(encoded)
  })
  vi.clearAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each(['image/jpeg', 'image/png', 'image/webp'])(
  'normaliza galería %s a File WebP de 1600px sin base64',
  async (type) => {
    const file = new File(['original'], 'foto.original.' + type.split('/')[1], { type })
    const result = await optimizeEvidenceImage(file)
    expect(result).toBeInstanceOf(File)
    expect(result.name).toBe('foto.original.webp')
    expect(result.type).toBe('image/webp')
    expect(result.size).toBe(encoded!.size)
    expect(dimensions).toEqual([1600, 1200])
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200)
    expect(encode).toHaveBeenCalledExactlyOnceWith('image/webp', 0.82)
    expect(URL.createObjectURL).toHaveBeenCalledWith(file)
    expect(revoke).toHaveBeenCalledWith('blob:source')
  },
)
it('no amplía imágenes pequeñas', async () => {
  width = 640
  height = 480
  await optimizeEvidenceImage(new File(['png'], 'small.png', { type: 'image/png' }))
  expect(dimensions).toEqual([640, 480])
})
it('respeta la geometría vertical decodificada por el navegador', async () => {
  width = 1200
  height = 2400
  await optimizeEvidenceImage(new File(['jpeg'], 'portrait.jpg', { type: 'image/jpeg' }))
  expect(dimensions).toEqual([800, 1600])
})
it('informa fallo de decodificación y libera la URL de origen', async () => {
  decodeFails = true
  await expect(
    optimizeEvidenceImage(new File(['broken'], 'broken.jpg', { type: 'image/jpeg' })),
  ).rejects.toThrow('No se pudo decodificar')
  expect(encode).not.toHaveBeenCalled()
  expect(revoke).toHaveBeenCalledOnce()
})
it('rechaza salida optimizada mayor de 5MB con mensaje claro', async () => {
  Object.defineProperty(encoded, 'size', { value: 5 * 1024 * 1024 + 1 })
  await expect(
    optimizeEvidenceImage(new File(['jpeg'], 'large.jpg', { type: 'image/jpeg' })),
  ).rejects.toThrow('La imagen optimizada supera 5 MB')
  expect(revoke).toHaveBeenCalledOnce()
})
it('rechaza un navegador que no produce WebP real y dimensiones inválidas', async () => {
  encoded = new Blob(['jpeg'], { type: 'image/jpeg' })
  await expect(evidenceImageFile({} as CanvasImageSource, 640, 480, 'camera')).rejects.toThrow(
    'WebP válida',
  )
  await expect(evidenceImageFile({} as CanvasImageSource, 0, 480, 'camera')).rejects.toThrow(
    'decodificar',
  )
})
it('permite optimizar originales grandes y mantiene el máximo de fotos y límite final', () => {
  const original = new File(['original'], 'large.jpg', { type: 'image/jpeg' })
  Object.defineProperty(original, 'size', { value: 6 * 1024 * 1024 })
  expect(validateFiles([original], 0, true).accepted).toEqual([original])
  expect(validateFiles([original], 0).errors).not.toEqual([])
  expect(validateFiles([original], 5, true).accepted).toEqual([])
})
