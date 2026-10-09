export function validateFiles(
  files: File[],
  existingCount: number,
  beforeOptimization = false,
): { accepted: File[]; errors: string[] } {
  const accepted: File[] = []
  const errors: string[] = []
  for (const file of files) {
    const extensions: Record<string, RegExp> = {
      'image/jpeg': /\.jpe?g$/i,
      'image/png': /\.png$/i,
      'image/webp': /\.webp$/i,
    }
    if (!extensions[file.type]?.test(file.name))
      errors.push(`${file.name}: usa JPG, PNG o WebP con extensión y tipo coincidentes.`)
    else if (!file.size || (!beforeOptimization && file.size > 5 * 1024 * 1024))
      errors.push(`${file.name}: el tamaño debe ser entre 1 byte y 5 MB.`)
    else if (existingCount + accepted.length >= 5)
      errors.push(`${file.name}: el máximo es 5 fotografías.`)
    else accepted.push(file)
  }
  return { accepted, errors }
}
