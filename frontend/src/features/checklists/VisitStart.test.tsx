import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderPage } from '../../test/render'
import { createMockRepositories } from '../../test/doubles/repositories'
import { VisitStart } from './VisitStart'
import { AppError } from '../../services/errors'
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
async function setup() {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  const visit = await repos.checklists.claim(1)
  const store = await repos.stores.get(1)
  return { repos, visit, store }
}
for (const [code, failure] of [
  [1, 'denied'],
  [2, 'unavailable'],
  [3, 'timeout'],
] as const)
  it(`llegada ${failure}: ofrece excepción sin coordenadas ficticias`, async () => {
    const { repos, visit, store } = await setup()
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: PositionCallback, error: PositionErrorCallback) =>
          error({ code } as GeolocationPositionError),
      },
    })
    const request = vi.spyOn(repos.visits, 'requestException')
    const confirmed = vi.fn()
    renderPage(<VisitStart visit={visit} store={store} onStarted={confirmed} />, repos)
    fireEvent.click(screen.getByRole('button', { name: 'Registrar llegada' }))
    await screen.findByRole('button', { name: 'Reintentar ubicación' })
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar excepción GPS' }))
    fireEvent.change(screen.getByLabelText('Justificación de la excepción'), {
      target: { value: 'No se pudo obtener GPS al llegar.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar excepción GPS' }))
    await vi.waitFor(() => expect(confirmed).toHaveBeenCalledOnce())
    expect(request.mock.calls[0]?.[1]).toEqual({
      type: 'location',
      scope: 'arrival',
      reason: 'No se pudo obtener GPS al llegar.',
      failure,
    })
    const started = await repos.visits.get(1)
    expect(started.phase).toBe('physical_work')
    expect(started.occupiesTechnician).toBe(true)
    expect(started.formOpenedAt).toBeUndefined()
    expect(started.submittedAt).toBeUndefined()
  })
it('rechazo conserva lectura real fuera de radio', async () => {
  const { repos, visit, store } = await setup()
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({
          coords: { latitude: 0, longitude: 0, accuracy: 8 },
          timestamp: Date.now(),
        } as GeolocationPosition),
    },
  })
  vi.spyOn(repos.visits, 'start').mockRejectedValue(
    new AppError('validation', 'Fuera de radio.', { failure: ['out_of_radius'] }),
  )
  const request = vi.spyOn(repos.visits, 'requestException')
  renderPage(<VisitStart visit={visit} store={store} onStarted={() => undefined} />, repos)
  fireEvent.click(screen.getByRole('button', { name: 'Registrar llegada' }))
  await screen.findByRole('button', { name: 'Solicitar excepción GPS' })
  fireEvent.click(screen.getByRole('button', { name: 'Solicitar excepción GPS' }))
  fireEvent.change(screen.getByLabelText('Justificación de la excepción'), {
    target: { value: 'Lectura GPS fuera de radio al llegar.' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar excepción GPS' }))
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce())
  expect(request.mock.calls[0]?.[1]).toMatchObject({
    scope: 'arrival',
    failure: 'out_of_radius',
    location: { latitude: 0, longitude: 0, accuracy: 8 },
  })
})
it('stale obtiene otra lectura fresca automáticamente', async () => {
  const { repos, visit, store } = await setup()
  const gps = vi.fn((ok: PositionCallback) =>
    ok({
      coords: { latitude: store.latitude, longitude: store.longitude, accuracy: 8 },
      timestamp: Date.now(),
    } as GeolocationPosition),
  )
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: gps },
  })
  const start = vi
    .spyOn(repos.visits, 'start')
    .mockRejectedValueOnce(new AppError('validation', 'Lectura caducada.', { failure: ['stale'] }))
  const confirmed = vi.fn()
  renderPage(<VisitStart visit={visit} store={store} onStarted={confirmed} />, repos)
  fireEvent.click(screen.getByRole('button', { name: 'Registrar llegada' }))
  await vi.waitFor(() => expect(confirmed).toHaveBeenCalledOnce())
  expect(gps).toHaveBeenCalledTimes(2)
  expect(start).toHaveBeenCalledTimes(2)
})
it('si la nueva lectura falla, no reutiliza la lectura stale para la excepción', async () => {
  const { repos, visit, store } = await setup()
  const gps = vi
    .fn<(ok: PositionCallback, error: PositionErrorCallback) => void>()
    .mockImplementationOnce((ok) =>
      ok({
        coords: { latitude: store.latitude, longitude: store.longitude, accuracy: 8 },
        timestamp: Date.now(),
      } as GeolocationPosition),
    )
    .mockImplementationOnce((_ok, error) => error({ code: 1 } as GeolocationPositionError))
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: gps },
  })
  vi.spyOn(repos.visits, 'start').mockRejectedValueOnce(
    new AppError('validation', 'Lectura caducada.', { failure: ['stale'] }),
  )
  const request = vi.spyOn(repos.visits, 'requestException')
  const confirmed = vi.fn()
  renderPage(<VisitStart visit={visit} store={store} onStarted={confirmed} />, repos)
  fireEvent.click(screen.getByRole('button', { name: 'Registrar llegada' }))
  await screen.findByRole('button', { name: 'Solicitar excepción GPS' })
  fireEvent.click(screen.getByRole('button', { name: 'Solicitar excepción GPS' }))
  fireEvent.change(screen.getByLabelText('Justificación de la excepción'), {
    target: { value: 'Permiso denegado al renovar la lectura.' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar excepción GPS' }))
  await vi.waitFor(() => expect(confirmed).toHaveBeenCalledOnce())
  expect(request.mock.calls[0]?.[1]).toMatchObject({ scope: 'arrival', failure: 'denied' })
  expect(request.mock.calls[0]?.[1]).not.toHaveProperty('location')
})
