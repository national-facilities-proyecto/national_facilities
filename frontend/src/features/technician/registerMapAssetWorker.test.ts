import { afterEach, expect, it, vi } from 'vitest'
import { registerMapAssetWorker } from './registerMapAssetWorker'
const originalWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
const originalSecure = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  if (originalWorker) Object.defineProperty(navigator, 'serviceWorker', originalWorker)
  else Reflect.deleteProperty(navigator, 'serviceWorker')
  if (originalSecure) Object.defineProperty(window, 'isSecureContext', originalSecure)
})
function setup() {
  vi.stubEnv('PROD', true)
  const register = vi.fn().mockResolvedValue({})
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } })
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  return register
}
it('registra un worker módulo de mismo origen en producción sin usar caché HTTP para actualizaciones', async () => {
  const register = setup()
  await registerMapAssetWorker()
  expect(register).toHaveBeenCalledExactlyOnceWith('/map-assets-sw.js', {
    type: 'module',
    scope: '/',
    updateViaCache: 'none',
  })
})
it.each(['development', 'insecure'])('no registra en %s', async (condition) => {
  const register = setup()
  if (condition === 'development') vi.stubEnv('PROD', false)
  else Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
  await registerMapAssetWorker()
  expect(register).not.toHaveBeenCalled()
})
it('un registro denegado no impide abrir la aplicación', async () => {
  const register = setup()
  register.mockRejectedValueOnce(new Error('denied'))
  await expect(registerMapAssetWorker()).resolves.toBeUndefined()
})
it('continúa sin Service Worker si el navegador no tiene soporte', async () => {
  const register = setup()
  Reflect.deleteProperty(navigator, 'serviceWorker')
  await registerMapAssetWorker()
  expect(register).not.toHaveBeenCalled()
})
