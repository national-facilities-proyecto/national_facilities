import { AppError } from '../../services/errors'

export type CoordinateField = 'latitude' | 'longitude'

export function storeCoordinate(value: string, field: CoordinateField): number {
  const limit = field === 'latitude' ? 90 : 180
  const label = field === 'latitude' ? 'Latitud' : 'Longitud'
  const decimal = value.trim().replace(/−/g, '-').replace(',', '.')
  const number = Number(decimal)
  if (
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(decimal) ||
    !Number.isFinite(number) ||
    Math.abs(number) > limit
  ) {
    const message = `${label}: introduce un número entre −${limit} y ${limit}, sin grados ni letras.`
    throw new AppError('validation', message, { [field]: [message] })
  }
  return Number(number.toFixed(6))
}

export function pastedCoordinatePair(value: string) {
  const match = value.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)$/)
  // Una coma decimal sin espacios/signo/punto, como «-12,50», no es un par.
  if (!match || (!value.includes('.') && !/,\s|,[+-]/.test(value))) return undefined
  return { latitude: match[1], longitude: match[2] }
}
