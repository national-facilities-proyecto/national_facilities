import { AppError } from './errors'

const MAX_DIMENSION = 1600
const MAX_BYTES = 5 * 1024 * 1024

/** Canvas recibe la orientación ya interpretada por el navegador, sin base64. */
export async function evidenceImageFile(
  image: CanvasImageSource,
  width: number,
  height: number,
  name: string,
): Promise<File> {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new AppError('validation', 'No se pudo decodificar la imagen seleccionada.')
  const ratio = Math.min(1, MAX_DIMENSION / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * ratio))
  canvas.height = Math.max(1, Math.round(height * ratio))
  const context = canvas.getContext('2d')
  if (!context) throw new AppError('validation', 'No se pudo preparar la imagen WebP.')
  let blob: Blob | null
  try {
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
  } catch {
    throw new AppError('validation', 'No se pudo convertir la imagen seleccionada a WebP.')
  }
  if (!blob || blob.type !== 'image/webp' || !blob.size)
    throw new AppError('validation', 'El navegador no pudo generar una imagen WebP válida.')
  if (blob.size > MAX_BYTES)
    throw new AppError(
      'validation',
      'La imagen optimizada supera 5 MB. Selecciona otra fotografía.',
    )
  const stem = name.replace(/\.[^.]+$/, '') || 'evidencia'
  return new File([blob], `${stem}.webp`, { type: 'image/webp' })
}

export async function optimizeEvidenceImage(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size)
    throw new AppError('validation', 'Selecciona una imagen JPG, PNG o WebP válida.')
  const image = new Image()
  const url = URL.createObjectURL(file)
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () =>
        reject(new AppError('validation', 'No se pudo decodificar la imagen seleccionada.'))
      image.src = url
    })
    return await evidenceImageFile(image, image.naturalWidth, image.naturalHeight, file.name)
  } finally {
    URL.revokeObjectURL(url)
  }
}
