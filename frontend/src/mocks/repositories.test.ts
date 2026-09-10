import 'fake-indexeddb/auto'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMockRepositories } from './repositories'
import { readDatabase, writeDatabase, validateDatabase } from './storage'
import { createFixtures } from './fixtures'
import { localEvidenceRepository, validateFiles } from '../services/evidence'
import { dateBucket, dayOffset, inDateRange, localDate } from '../utils/dates'
import { readConfig } from '../app/config'
const repos = createMockRepositories()
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  repos.demo!.setScenario('normal')
})
async function login(id = 1) {
  return repos.auth.login({ kind: 'demo', userId: id })
}
async function start(id = 1) {
  await login()
  const visit = await repos.checklists.claim(id)
  const store = await repos.stores.get(visit.storeId)
  const coordinates = {
    latitude: store.latitude,
    longitude: store.longitude,
    accuracy: 8,
    capturedAt: Date.now(),
  }
  await repos.visits.start(id, coordinates)
  return { visit, coordinates }
}
async function completeDraft(id = 1) {
  const { visit, coordinates } = await start(id)
  await repos.checklists.saveDraft(id, {
    answers: visit.tasks.map((task) => ({
      taskId: task.id,
      result: 'conforme',
      observation: '',
      evidenceIds: task.photoRequired ? [`photo-${task.id}`] : [],
    })),
    evidenceIds: [],
    workDescription: '',
  })
  return coordinates
}
it('toma visita, conserva el estado entre instancias y maneja conflicto', async () => {
  await login()
  await repos.checklists.claim(1)
  expect((await createMockRepositories().checklists.get(1)).status).toBe('claimed')
  await expect(repos.checklists.claim(1)).rejects.toMatchObject({ code: 'conflict' })
  await login(5)
  expect((await repos.checklists.list()).some((visit) => visit.id === 1)).toBe(false)
})
it('simula conflicto antes de tomar y retira la visita del pool', async () => {
  await login()
  repos.demo!.setScenario('conflict_once')
  await expect(repos.checklists.claim(1)).rejects.toMatchObject({ code: 'conflict' })
  expect((await repos.checklists.list()).some((visit) => visit.id === 1)).toBe(false)
})
it('completa la segunda tienda con sus coordenadas y guarda el cierre', async () => {
  const coordinates = await completeDraft(2)
  const result = await repos.visits.complete(2, coordinates)
  expect(result.status).toBe('completed')
  expect(result.endLocation?.longitude).toBe(coordinates.longitude)
  await expect(repos.visits.complete(2, coordinates)).rejects.toMatchObject({ code: 'validation' })
})
it('bloquea tareas, observación y fotos pendientes', async () => {
  const { visit, coordinates } = await start()
  await expect(repos.visits.complete(1, coordinates)).rejects.toMatchObject({ code: 'validation' })
  await repos.checklists.saveDraft(1, {
    answers: visit.tasks.map((task) => ({
      taskId: task.id,
      result: 'no_conforme',
      observation: '',
      evidenceIds: [],
    })),
    workDescription: '',
    evidenceIds: [],
  })
  await expect(repos.visits.complete(1, coordinates)).rejects.toThrow(/Observación|Fotografía/)
})
it('bloquea inicio con ubicación fuera de radio e ID inexistente', async () => {
  await login()
  await repos.checklists.claim(1)
  await expect(
    repos.visits.start(1, { latitude: 0, longitude: 0, accuracy: 8, capturedAt: Date.now() }),
  ).rejects.toMatchObject({ reason: 'outside' })
  await expect(repos.checklists.get(999)).rejects.toMatchObject({ code: 'not_found' })
  await expect(repos.visits.get(999)).rejects.toMatchObject({ code: 'not_found' })
})
it('excepción solo por GPS no disponible, con rechazo y aprobación auditados', async () => {
  await completeDraft()
  await expect(
    repos.visits.requestException(1, 'GPS falla al cerrar.', 'outside'),
  ).rejects.toMatchObject({ code: 'validation' })
  await repos.visits.requestException(1, 'No hay señal GPS dentro de la tienda.', 'unavailable')
  await login(3)
  await expect(repos.visits.reviewException(1, false, '')).rejects.toMatchObject({
    code: 'validation',
  })
  await repos.visits.reviewException(1, false, 'Reintenta desde el acceso a la tienda.')
  expect((await repos.checklists.get(1)).status).toBe('in_progress')
  await login()
  await repos.visits.requestException(1, 'El permiso del GPS continúa denegado.', 'denied')
  await login(3)
  const visit = await repos.visits.reviewException(1, true, 'Evidencias revisadas.')
  expect(visit.status).toBe('completed')
  expect(visit.exception?.reviewerId).toBe(3)
  expect(visit.endLocation).toBeUndefined()
})
it('creación, programación, reasignación y resolución se ven entre roles', async () => {
  await login(2)
  const ticket = await repos.tickets.create({
    storeId: 1,
    category: 'Plomería',
    priority: 'Alta',
    description: 'Fuga de agua del baño.',
    evidenceIds: [],
  })
  await login(3)
  expect((await repos.tickets.list()).some((item) => item.id === ticket.id)).toBe(true)
  await repos.tickets.schedule(ticket.id, 5, dayOffset(0), 'Alta', '')
  await repos.tickets.schedule(
    ticket.id,
    1,
    dayOffset(1),
    'Media',
    'Cambio de disponibilidad del técnico.',
  )
  expect((await repos.tickets.get(ticket.id)).history).toHaveLength(3)
  await login()
  const visit = (await repos.visits.list()).find((item) => item.ticketId === ticket.id)!
  const store = await repos.stores.get(1)
  const coordinates = { ...store, accuracy: 8, capturedAt: Date.now() }
  await repos.visits.start(visit.id, coordinates)
  await repos.checklists.saveDraft(visit.id, {
    answers: [],
    workDescription: 'Se reparó la válvula y verificó la presión.',
    evidenceIds: ['photo'],
  })
  await repos.visits.complete(visit.id, coordinates)
  await login(2)
  expect((await repos.tickets.get(ticket.id)).status).toBe('resolved')
  expect((await repos.tickets.get(ticket.id)).technicalEvidenceIds).toEqual(['photo'])
})
it('visibilidad por tienda y rol, programación valida fecha y técnico', async () => {
  await login(6)
  const rows = await repos.tickets.list()
  expect(rows.every((ticket) => ticket.storeId === 2)).toBe(true)
  await expect(repos.tickets.get(101)).rejects.toMatchObject({ code: 'not_found' })
  await expect(repos.checklists.claim(2)).rejects.toMatchObject({ code: 'forbidden' })
  await login(3)
  await expect(repos.tickets.schedule(104, 1, dayOffset(-1), 'Alta', '')).rejects.toMatchObject({
    code: 'validation',
  })
  await expect(repos.tickets.schedule(104, 999, dayOffset(0), 'Alta', '')).rejects.toMatchObject({
    code: 'validation',
  })
})
it('latencia cancelable, error recuperable, vacío y datos inválidos', async () => {
  await login()
  repos.demo!.setScenario('error_once')
  await expect(repos.checklists.list()).rejects.toMatchObject({ code: 'network' })
  expect((await repos.checklists.list()).length).toBeGreaterThan(0)
  repos.demo!.setScenario('empty')
  expect(await repos.checklists.list()).toEqual([])
  const controller = new AbortController()
  controller.abort()
  await expect(repos.stores.list({ signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  })
  localStorage.setItem('nf:mock:v1', '{bad')
  expect(readDatabase).toThrow(/demo/)
  expect(validateDatabase({ version: 1, users: [] })).toBe(false)
})
it('admin crea registros y no puede quitar su propio acceso', async () => {
  await login(4)
  const users = await repos.administration.list('users')
  const admin = users.find((user) => user.id === 4)!
  await expect(
    repos.administration.save('users', { ...admin, active: false }),
  ).rejects.toMatchObject({ code: 'validation' })
  const client = await repos.administration.save('clients', {
    id: 0,
    name: 'Cliente Demo',
    email: 'client@example.test',
    taxId: 'TEST-2',
  })
  expect(client.id).toBeGreaterThan(1)
  expect((await repos.administration.list('clients')).some((item) => item.id === client.id)).toBe(
    true,
  )
  await login(1)
  await expect(repos.administration.list('users')).rejects.toMatchObject({ code: 'forbidden' })
})
it('dashboard usa datos actuales y maneja ausencia de resoluciones', async () => {
  await login(3)
  expect((await repos.dashboard.get()).averageHours).toBeNull()
  expect((await repos.dashboard.get()).pendingVisits).toBeGreaterThan(0)
  const db = readDatabase()
  db.visits = []
  db.tickets = []
  writeDatabase(db)
  const metrics = await repos.dashboard.get()
  expect(metrics.compliance).toBeNull()
  expect(metrics.pendingVisits).toBe(0)
})
it('valida archivos por MIME, extensión, tamaño y cantidad', () => {
  const valid = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })
  const wrong = new File(['photo'], 'photo.exe', { type: 'image/jpeg' })
  expect(validateFiles([valid, wrong], 0)).toMatchObject({ accepted: [valid] })
  expect(validateFiles([wrong], 0).errors).toHaveLength(1)
  expect(validateFiles([valid], 5).accepted).toHaveLength(0)
  expect(validateFiles([new File([], 'empty.png', { type: 'image/png' })], 0).errors).toHaveLength(
    1,
  )
})
it('guarda y elimina el Blob con sus metadatos', async () => {
  const { Blob: NodeBlob } = await import('node:buffer')
  vi.stubGlobal('Blob', NodeBlob)
  try {
    const blob = new Blob(['photo'], { type: 'image/jpeg' })
    const evidence = {
      id: 'stored-photo',
      name: 'Foto',
      blob,
      mimeType: 'image/jpeg',
      size: 5,
      capturedAt: new Date().toISOString(),
      source: 'camera' as const,
    }
    await localEvidenceRepository.put(evidence)
    const value = await localEvidenceRepository.get('stored-photo')
    expect(value?.size).toBe(5)
    await localEvidenceRepository.remove('stored-photo')
    expect(await localEvidenceRepository.get('stored-photo')).toBeUndefined()
  } finally {
    vi.unstubAllGlobals()
  }
})
it('fechas locales y configuración explícita', () => {
  const today = new Date(2026, 8, 9, 23, 59)
  expect(localDate(today)).toBe('2026-09-09')
  expect(dateBucket('2026-09-09T08:00:00', today)).toBe('today')
  expect(dateBucket('2026-09-08T08:00:00', today)).toBe('late')
  expect(dateBucket('2026-09-10T08:00:00', today)).toBe('future')
  expect(inDateRange('2026-09-09T20:00:00', '2026-09-09', '2026-09-09')).toBe(true)
  expect(() => readConfig({})).toThrow(/VITE_DATA_SOURCE/)
  expect(() => readConfig({ VITE_DATA_SOURCE: 'api' })).toThrow(/VITE_API_URL/)
  expect(readConfig({ VITE_DATA_SOURCE: 'mock' }).source).toBe('mock')
  expect(validateDatabase(createFixtures())).toBe(true)
})
it('rechaza persistencia con metadatos opcionales corruptos', () => {
  const original = createFixtures()
  expect(
    validateDatabase({
      ...original,
      visits: [{ ...original.visits[0], startLocation: { latitude: 'invalid' } }],
    }),
  ).toBe(false)
  expect(
    validateDatabase({
      ...original,
      visits: [{ ...original.visits[0], exception: { reason: [] } }],
    }),
  ).toBe(false)
  expect(
    validateDatabase({ ...original, tickets: [{ ...original.tickets[0], evidenceIds: [42] }] }),
  ).toBe(false)
  expect(
    validateDatabase({ ...original, tickets: [{ ...original.tickets[0], technicianId: '1' }] }),
  ).toBe(false)
})
it('tienda puede consultar el técnico asignado sin ver usuarios de otras tiendas', async () => {
  await login(2)
  const users = await repos.users.list()
  expect(users.some((user) => user.id === 1)).toBe(true)
  expect(users.some((user) => user.id === 6 || user.role === 'administrator')).toBe(false)
})
