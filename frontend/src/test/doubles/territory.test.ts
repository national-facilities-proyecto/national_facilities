import { beforeEach, expect, it } from 'vitest'
import { createMockRepositories } from './repositories'
import { readDatabase, writeDatabase } from './storage'

const repos = createMockRepositories()
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

it('cobertura concede acceso y storeIds no lo concede para técnico', async () => {
  await repos.auth.login({ kind: 'demo', userId: 1 })
  const db = readDatabase()
  db.users[0].coverages = [{ clientId: 1, zoneId: 1 }]
  writeDatabase(db)
  expect((await repos.stores.list()).map((store) => store.id)).toEqual([1])
  db.users[0].coverages = []
  writeDatabase(db)
  expect(await repos.stores.list()).toEqual([])
})

it('devuelve técnicos elegibles de la pareja exacta', async () => {
  await repos.auth.login({ kind: 'demo', userId: 3 })
  const db = readDatabase()
  db.users[0].coverages = [{ clientId: 1, zoneId: 2 }]
  writeDatabase(db)
  expect((await repos.users.eligible!(1)).map((user) => user.id)).toEqual([5])
})

it('sin zona no se concede acceso ni técnicos por cobertura', async () => {
  await repos.auth.login({ kind: 'demo', userId: 3 })
  const db = readDatabase()
  delete db.stores[0].zoneId
  // Guarda un registro legacy explícito permitido, sin inferir una zona.
  writeDatabase(db)
  expect(await repos.users.eligible!(1)).toEqual([])
})

it('filtra especialidades y rechaza un reporte manipulado con categoría deshabilitada', async () => {
  await repos.auth.login({ kind: 'demo', userId: 2 })
  const db = readDatabase()
  db.clientSpecialties.find((row) => row.categoryId === 2)!.active = false
  writeDatabase(db)
  expect((await repos.tickets.catalogs!()).categories.map((item) => item.id)).not.toContain(2)
  await expect(
    repos.tickets.create({
      storeId: 1,
      category: 'Eléctrico',
      priority: 'Alta',
      description: 'Reporte manipulado de prueba',
      evidenceIds: [],
    }),
  ).rejects.toThrow('Especialidad no habilitada')
})

it('no permite crear tiendas sin zona ni coberturas cruzadas o repetidas', async () => {
  await repos.auth.login({ kind: 'demo', userId: 4 })
  const db = readDatabase()
  await expect(
    repos.administration.save('stores', { ...db.stores[0], id: 0, zoneId: null }),
  ).rejects.toThrow('zona del cliente')
  const user = db.users[0]
  await expect(
    repos.administration.save('users', { ...user, coverages: [{ clientId: 99, zoneId: 1 }] }),
  ).rejects.toThrow('mismo cliente')
  await expect(
    repos.administration.save('users', {
      ...user,
      coverages: [
        { clientId: 1, zoneId: 1 },
        { clientId: 1, zoneId: 1 },
      ],
    }),
  ).rejects.toThrow('No repitas')
})

it('conserva acceso al trabajo propio iniciado tras cambiar cobertura', async () => {
  await repos.auth.login({ kind: 'demo', userId: 1 })
  await repos.checklists.claim(1)
  const store = await repos.stores.get(1)
  await repos.visits.start(1, { ...store, accuracy: 8, capturedAt: Date.now() })
  const db = readDatabase()
  db.users[0].coverages = [{ clientId: 1, zoneId: 2 }]
  writeDatabase(db)
  expect((await repos.visits.get(1)).startedAt).toBeDefined()
  expect((await repos.stores.get(1)).id).toBe(1)
  db.visits[0].status = 'completed'
  writeDatabase(db)
  await expect(repos.visits.get(1)).rejects.toMatchObject({ code: 'not_found' })
})
