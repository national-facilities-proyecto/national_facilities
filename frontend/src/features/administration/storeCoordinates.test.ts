import { expect, it } from 'vitest'
import { AppError } from '../../services/errors'
import { pastedCoordinatePair, storeCoordinate } from './storeCoordinates'

it('acepta las coordenadas copiadas y redondea al formato del servidor sin cambiar signos', () => {
  expect(storeCoordinate('-12.127876278416577', 'latitude')).toBe(-12.127876)
  expect(storeCoordinate('-76.9889393558228', 'longitude')).toBe(-76.988939)
  expect(storeCoordinate(' −12,127876278416577 ', 'latitude')).toBe(-12.127876)
  expect(storeCoordinate('76.9889399', 'longitude')).toBe(76.98894)
  expect(storeCoordinate('0', 'latitude')).toBe(0)
  expect(storeCoordinate('90', 'latitude')).toBe(90)
  expect(storeCoordinate('-180', 'longitude')).toBe(-180)
})

it('rechaza fuera de rango antes de redondear y conserva el error en su campo', () => {
  for (const field of ['latitude', 'longitude'] as const) {
    const limit = field === 'latitude' ? 90 : 180
    for (const value of [
      '',
      ' ',
      'NaN',
      'Infinity',
      '12 grados',
      '1e1',
      '12,34,56',
      `${limit}.0000001`,
      `${-limit}.0000001`,
    ]) {
      try {
        storeCoordinate(value, field)
        throw new Error('Se aceptó una coordenada inválida.')
      } catch (cause) {
        expect(cause).toBeInstanceOf(AppError)
        if (!(cause instanceof AppError)) throw cause
        expect(cause.fields[field]).toEqual([cause.message])
      }
    }
  }
})

it('separa el par de coordenadas sin confundir una coma decimal individual', () => {
  expect(pastedCoordinatePair('-12.127876278416577, -76.9889393558228')).toEqual({
    latitude: '-12.127876278416577',
    longitude: '-76.9889393558228',
  })
  expect(pastedCoordinatePair('-12.127876278416577,-76.9889393558228')).toBeDefined()
  expect(pastedCoordinatePair('0, -77')).toEqual({ latitude: '0', longitude: '-77' })
  for (const value of ['-12,50', '-12.127876278416577', '-12,50, -76,99', 'lugar desconocido'])
    expect(pastedCoordinatePair(value)).toBeUndefined()
})
