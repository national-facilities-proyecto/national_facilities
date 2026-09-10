import { expect, it, vi } from 'vitest'
import { distanceMeters, requestLocation, validateLocation } from '../features/geolocation/location'
const store = { latitude: -12.15, longitude: -76.97 }
const fresh = () => ({ ...store, accuracy: 8, capturedAt: Date.now() })
it('devuelve GPS reciente con precisión y timestamp', async () => {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: (position: unknown) => void) =>
        ok({ coords: fresh(), timestamp: Date.now() }),
    },
  })
  await expect(requestLocation()).resolves.toMatchObject({ accuracy: 8, latitude: store.latitude })
})
it.each([
  [1, 'denied'],
  [2, 'unavailable'],
  [3, 'timeout'],
])('clasifica error GPS %s', async (code, reason) => {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: (_ok: unknown, fail: (error: unknown) => void) => fail({ code }) },
  })
  await expect(requestLocation()).rejects.toMatchObject({ reason })
})
it('maneja navegador sin GPS y cancelación', async () => {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
  await expect(requestLocation()).rejects.toMatchObject({ reason: 'unavailable' })
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: vi.fn() },
  })
  const controller = new AbortController()
  const promise = requestLocation(controller.signal)
  controller.abort()
  await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
})
it('valida radio, precisión, antigüedad y la tienda correcta', () => {
  expect(distanceMeters(store, store)).toBe(0)
  expect(validateLocation(fresh(), store, 100)).toBe(0)
  expect(() => validateLocation(fresh(), { latitude: 0, longitude: 0 }, 100)).toThrow(/radio/)
  expect(() => validateLocation({ ...fresh(), accuracy: 300 }, store, 100)).toThrow(/Precisión/)
  expect(() =>
    validateLocation({ ...fresh(), capturedAt: Date.now() - 61000 }, store, 100),
  ).toThrow(/caducado/)
  expect(() => validateLocation({ ...fresh(), latitude: NaN }, store, 100)).toThrow(/válida/)
})
