import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createHttpClient, persistSession, savedSession } from './client'
import { createHttpRepositories } from '../adapters/httpRepositories'
import { mapStore, mapVisit, mapUser } from '../adapters/mappers'
import type { Session } from '../../types/models'

const session: Session = {
  access: 'access',
  refresh: 'refresh',
  expiresAt: Date.now() + 3600000,
  source: 'api',
  user: {
    id: 1,
    username: 'tech',
    name: 'Technician',
    email: 'tech@test.invalid',
    role: 'technician',
    storeIds: [1],
    active: true,
    passwordInitialized: true,
  },
}
beforeEach(() => {
  sessionStorage.clear()
  persistSession(session)
})
afterEach(() => vi.unstubAllGlobals())

for (const [status, code] of [
  [400, 'validation'],
  [403, 'forbidden'],
  [404, 'not_found'],
  [409, 'conflict'],
] as const)
  it(`propaga ${status}, detalle y errores por campo`, async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ description: ['Descripción obligatoria.'] }), { status }),
        ),
    )
    await expect(createHttpClient('http://api.test')('/resource/')).rejects.toMatchObject({
      code,
      status,
      fields: { description: ['Descripción obligatoria.'] },
    })
  })

it('renueva una sola vez para consultas simultáneas y conserva la identidad del servidor', async () => {
  persistSession({ ...session, expiresAt: 0 })
  const fetcher = vi
    .fn()
    .mockImplementation((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url.endsWith('/auth/refresh/')
              ? { ...session, access: 'renewed', refresh: 'rotated' }
              : { ok: true },
          ),
          { status: 200 },
        ),
      ),
    )
  vi.stubGlobal('fetch', fetcher)
  const request = createHttpClient('http://api.test')
  await Promise.all([request('/first/'), request('/second/')])
  expect(
    fetcher.mock.calls.filter((call) => String(call[0]).endsWith('/auth/refresh/')),
  ).toHaveLength(1)
  expect(savedSession()?.access).toBe('renewed')
})

it('un refresh rechazado produce 401 y elimina la sesión', async () => {
  persistSession({ ...session, expiresAt: 0 })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{"detail":"Sesión revocada."}', { status: 401 })),
  )
  await expect(createHttpClient('http://api.test')('/first/')).rejects.toMatchObject({
    code: 'unauthorized',
  })
  expect(savedSession()).toBeNull()
})

it('descarga Blob autenticado y no intenta analizarlo como JSON', async () => {
  const { Blob: NodeBlob } = await import('node:buffer')
  vi.stubGlobal('Blob', NodeBlob)
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response('image-bytes', { headers: { 'Content-Type': 'image/jpeg' } }))
  vi.stubGlobal('fetch', fetcher)
  const blob = await createHttpClient('http://api.test')('/photo/', {}, 'blob')
  expect(blob).toBeInstanceOf(Blob)
  const init: unknown = fetcher.mock.calls[0]?.[1]
  expect(
    typeof init === 'object' &&
      init !== null &&
      'headers' in init &&
      init.headers instanceof Headers,
  ).toBe(true)
})

it('un timeout conserva la clave del ticket para reintentar sin duplicarlo', async () => {
  const keys: string[] = []
  let failed = false
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string, init: RequestInit) => {
      if (url.endsWith('/catalogos/'))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              categories: [{ id: 1, name: 'Eléctrico' }],
              priorities: [{ id: 1, name: 'Alta', firstResponseHours: 2, resolutionHours: 24 }],
            }),
          ),
        )
      keys.push(new Headers(init.headers).get('Idempotency-Key') ?? '')
      if (!failed) {
        failed = true
        return Promise.reject(new TypeError('connection reset'))
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: 2,
            storeId: 1,
            reporterId: 1,
            category: 'Eléctrico',
            categoryId: 1,
            priority: 'Alta',
            priorityId: 1,
            description: 'Reported incident',
            status: 'open',
            workStatus: 'pending',
            createdAt: new Date().toISOString(),
            technicianId: null,
            scheduledAt: null,
            resolvedAt: null,
            resolution: '',
            evidenceIds: [],
            technicalEvidenceIds: [],
            history: [],
            revision: 0,
            visitId: null,
          }),
        ),
      )
    }),
  )
  const repos = createHttpRepositories('http://api.test')
  const input = {
    storeId: 1,
    category: 'Eléctrico',
    priority: 'Alta',
    description: 'Reported incident',
    evidenceIds: [],
  }
  await expect(repos.tickets.create(input)).rejects.toMatchObject({ code: 'network' })
  expect((await createHttpRepositories('http://api.test').tickets.create(input)).id).toBe(2)
  expect(keys[0]).toBe(keys[1])
  expect(keys[0]).not.toBe('')
})

it('DTO incompatibles se rechazan sin casts ni valores de respaldo', () => {
  expect(() => mapUser({ ...session.user, role: 'unknown' })).toThrow()
  expect(() => mapStore({ id: '1' })).toThrow()
  expect(() => mapVisit({ id: 1, revision: 'old' })).toThrow()
})
