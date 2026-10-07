import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createHttpRepositories } from './httpRepositories'
import { persistSession } from '../http/client'
import { createFixtures } from '../../test/doubles/fixtures'
const now = '2026-10-05T10:00:00Z'
const rawVisit = {
  id: 1,
  storeId: 1,
  technicianId: 1,
  origin: 'checklist',
  scheduledAt: now,
  status: 'in_progress',
  workStatus: 'in_progress',
  phase: 'results',
  occupiesTechnician: true,
  readOnly: false,
  gpsExceptionPending: false,
  tasks: [],
  answers: [],
  workDescription: '',
  evidenceIds: [],
  startedAt: now,
  physicalEndedAt: now,
  formOpenedAt: now,
  expiresAt: '2026-10-05T10:05:00Z',
  revision: 3,
  serverNow: now,
  timeLimitExceeded: false,
  exceptions: [],
  exceptionHistory: [],
  claimHistory: [],
  radiusMeters: 100,
  legacy: false,
}
beforeEach(() => {
  sessionStorage.clear()
  persistSession({
    access: 'access',
    refresh: 'refresh',
    expiresAt: Date.now() + 3600000,
    user: createFixtures().users[0],
    source: 'api',
  })
})
afterEach(() => vi.unstubAllGlobals())
function transport(response: unknown = rawVisit) {
  const fetcher = vi
    .fn<(url: string, options: RequestInit) => Promise<Response>>()
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(response))))
  vi.stubGlobal('fetch', fetcher)
  return { repo: createHttpRepositories('http://api.test').visits, fetcher }
}
it('No realizado envía únicamente reason y conserva el estado y cronología del backend', async () => {
  const response = {
    ...rawVisit,
    status: 'cancelled',
    workStatus: 'cancelled',
    phase: 'not_performed',
    readOnly: true,
    occupiesTechnician: false,
    notPerformedAt: '2026-10-05T10:02:00Z',
  }
  const { repo, fetcher } = transport(response)
  const result = await repo.markNotPerformed(1, 'El acceso a la tienda permanece cerrado.')
  expect(fetcher.mock.calls[0][0]).toBe('http://api.test/visitas/1/no-realizada/')
  expect(fetcher.mock.calls[0][1].method).toBe('POST')
  expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual({
    reason: 'El acceso a la tienda permanece cerrado.',
  })
  expect(result).toMatchObject({
    phase: 'not_performed',
    status: 'cancelled',
    readOnly: true,
    occupiesTechnician: false,
    startedAt: rawVisit.startedAt,
    physicalEndedAt: rawVisit.physicalEndedAt,
    formOpenedAt: rawVisit.formOpenedAt,
    expiresAt: rawVisit.expiresAt,
    notPerformedAt: response.notPerformedAt,
  })
})
it('apertura, envío normal y revisión no transportan GPS', async () => {
  const { repo, fetcher } = transport()
  await repo.openForm(1)
  await repo.complete(1, { revision: 3, exceptions: [] })
  const exceptions = [
    {
      type: 'location' as const,
      scope: 'arrival' as const,
      reason: 'Permiso denegado al llegar.',
      failure: 'denied',
      revision: 2,
    },
  ]
  await repo.submitReview(1, { revision: 3, exceptions })
  const bodies = fetcher.mock.calls.map((args) => JSON.parse(args[1].body as string) as unknown)
  expect(bodies).toEqual([{}, { revision: 3, exceptions: [] }, { revision: 3, exceptions }])
  for (const body of bodies) {
    expect(body).not.toHaveProperty('location')
    expect(body).not.toHaveProperty('failure')
  }
})
it('arrival/closure conservan scope y solo lectura GPS real en payload', async () => {
  const { repo, fetcher } = transport()
  const location = { latitude: -12, longitude: -77, accuracy: 8, capturedAt: 123 }
  await repo.start(1, location)
  await repo.recordEndGps(1, location)
  await repo.requestException(1, {
    type: 'location',
    scope: 'arrival',
    reason: 'Permiso denegado al llegar.',
    failure: 'denied',
  })
  await repo.requestException(1, {
    type: 'location',
    scope: 'closure',
    reason: 'Lectura fuera de radio al terminar.',
    failure: 'out_of_radius',
    location,
    revision: 2,
  })
  const body = (n: number) => JSON.parse(fetcher.mock.calls[n][1].body as string) as unknown
  expect(body(0)).toEqual({ location })
  expect(body(1)).toEqual({ location })
  expect(body(2)).toEqual({
    type: 'location',
    scope: 'arrival',
    reason: 'Permiso denegado al llegar.',
    failure: 'denied',
  })
  expect(body(2)).not.toHaveProperty('location')
  expect(body(3)).toMatchObject({ scope: 'closure', location, revision: 2 })
})
it('recuperación y revisiones usan endpoints independientes', async () => {
  const { repo, fetcher } = transport({
    activeExecution: rawVisit,
    reservations: [],
    corrections: [],
    inReview: [],
  })
  expect((await repo.recovery()).activeExecution?.phase).toBe('results')
  expect(fetcher.mock.calls[0][0]).toBe('http://api.test/visitas/recuperacion/')
  fetcher.mockImplementation(() => Promise.resolve(new Response(JSON.stringify([rawVisit]))))
  expect(await repo.pendingReviews()).toHaveLength(1)
  expect(fetcher.mock.calls[1][0]).toBe('http://api.test/revisiones/pendientes/')
})
it('demora tiene scope form y versión propia al corregir', async () => {
  const { repo, fetcher } = transport()
  await repo.requestTimeException(1, 'Interrupción de conexión al registrar.', 2)
  const body: unknown = JSON.parse(fetcher.mock.calls[0][1].body as string)
  expect(body).toEqual({
    type: 'time_limit',
    scope: 'form',
    reason: 'Interrupción de conexión al registrar.',
    revision: 2,
  })
})
