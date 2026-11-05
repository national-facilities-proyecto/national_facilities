import { describe, expect, it } from 'vitest'
import { toProviderLatLng } from './mapProviderAdapter'

describe('Map provider ACL / contrato de coordenadas', () => {
  it('convierte coordenadas válidas al formato de Leaflet', () => {
    expect(toProviderLatLng({ latitude: -12.1739, longitude: -77.0181 })).toEqual([
      -12.1739,
      -77.0181,
    ])
    expect(toProviderLatLng({ latitude: 90, longitude: 180 })).toEqual([90, 180])
  })

  it.each([
    { latitude: 91, longitude: -77 },
    { latitude: -91, longitude: 0 },
    { latitude: 0, longitude: 181 },
    { latitude: Infinity, longitude: 0 },
    { latitude: NaN, longitude: 0 },
    { latitude: '-12.17', longitude: -77 },
    { latitude: null, longitude: 0 },
  ])('rechaza entradas incompatibles y no las pasa al proveedor: %j', (location) => {
    expect(toProviderLatLng(location)).toBeNull()
  })
})
