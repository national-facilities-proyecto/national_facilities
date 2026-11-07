import { describe, expect, it } from 'vitest'
import { getMapProviders, openFreeMapProvider } from './mapProviders'

describe('configuración cartográfica', () => {
  it('mantiene OpenFreeMap como único origen sin respaldo configurado', () => {
    expect(getMapProviders('')).toEqual([openFreeMapProvider])
  })
  it('agrega AWS después del principal con XYZ PBF y atribuciones', () => {
    const providers = getMapProviders(' https://maps.example.org/lima/v1/{z}/{x}/{y}.pbf ')
    expect(providers.map((provider) => provider.id)).toEqual(['openfreemap', 'aws'])
    expect(providers[1].url).toBe('https://maps.example.org/lima/v1/{z}/{x}/{y}.pbf')
    expect(providers[1].attribution).toContain('https://www.openstreetmap.org/copyright')
    expect(providers[1].attribution).toContain('https://openmaptiles.org/')
  })
  it.each([
    'http://maps.example.org/{z}/{x}/{y}.pbf',
    'https://secret:password@maps.example.org/{z}/{x}/{y}.pbf',
    'https://maps.example.org/{z}/{x}/{y}.pbf?token=secret',
    'https://maps.example.org/{z}/{x}/{y}.pbf#fragment',
    'https://maps.example.org/{z}/{x}/{y}.png',
    'https://maps.example.org/{z}/{x}.pbf',
    '/tiles/{z}/{x}/{y}.pbf',
    'invalid',
  ])('deshabilita un respaldo inválido sin romper OpenFreeMap: %s', (url) => {
    expect(getMapProviders(url)).toEqual([openFreeMapProvider])
  })
})
