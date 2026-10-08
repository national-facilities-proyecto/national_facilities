import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { access, api, call, login, object, python, string } from './helpers.js'

function isolatedCase(empty = false) {
  const raw: unknown = JSON.parse(
    execFileSync(
      python,
      [resolve('../backend/test_support/checklist_map_case.py'), ...(empty ? ['--empty'] : [])],
      { cwd: resolve('..'), encoding: 'utf8' },
    ),
  )
  const data = object(raw)
  if (!Array.isArray(data.visitIds) || !data.visitIds.every((id) => typeof id === 'number'))
    throw new Error('IDs de visitas inválidos.')
  return {
    username: string(data.username),
    visitIds: data.visitIds.map((id: unknown) => {
      if (typeof id !== 'number') throw new Error('ID inválido.')
      return id
    }),
  }
}

async function start(request: APIRequestContext, token: string, id: number) {
  const path = `/visitas/${id}`
  await call(request, `/visitas/pool/${id}/tomar/`, token, {})
  const current = object(await call(request, path + '/', token))
  const snapshot = object(current.storeSnapshot)
  return object(
    await call(request, path + '/iniciar/', token, {
      location: {
        latitude: snapshot.latitude,
        longitude: snapshot.longitude,
        accuracy: 8,
        capturedAt: Date.now(),
      },
    }),
  )
}

async function complete(request: APIRequestContext, token: string, id: number) {
  const path = `/visitas/${id}`
  await start(request, token, id)
  await call(request, path + '/terminar/', token, {})
  const opened = object(await call(request, path + '/formulario/', token, {}))
  if (!Array.isArray(opened.tasks)) throw new Error('Tareas inválidas.')
  const saved = object(
    await call(request, path + '/borrador/', token, {
      revision: opened.revision,
      answers: opened.tasks.map((task) => ({
        taskId: object(task).id,
        result: 'conforme',
        observation: '',
        evidenceIds: [],
      })),
      workDescription: '',
      evidenceIds: [],
    }),
  )
  const result = object(
    await call(request, path + '/finalizar/', token, { revision: saved.revision, exceptions: [] }),
  )
  expect(result.status).toBe('completed')
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  // Tile protobuf vacío válido: se prueba Leaflet real sin depender del proveedor.
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: Buffer.alloc(0) }),
  )
})

test('todas finalizadas: mapa visible por pestaña, sin duplicados y navegación por marcador', async ({
  page,
  request,
}) => {
  const fixture = isolatedCase()
  const token = await access(request, fixture.username)
  for (const id of fixture.visitIds) await complete(request, token, id)
  const raw = await call(request, '/checklists/', token)
  if (!Array.isArray(raw)) throw new Error('Visitas incompatibles.')
  const visits = raw.map(object)
  expect(visits).toHaveLength(4)
  expect(visits.every((visit) => visit.status === 'completed')).toBe(true)
  const selected = visits[0]
  const name = string(object(selected.storeSnapshot).name)

  // El técnico del seed no tiene cobertura ni acceso a las tiendas del caso.
  const outsider = await access(request, 'tech')
  const denied = await request.get(`${api}/visitas/${String(selected.id)}/`, {
    headers: { Authorization: `Bearer ${outsider}` },
  })
  expect(denied.status()).toBe(404)

  await login(page, fixture.username)
  await expect(page.locator('.nf-map-status')).toHaveCount(0)
  for (const tab of ['Bolsa compartida', 'Mis trabajos', 'En revisión', 'Finalizados']) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    await expect(page.getByRole('region', { name: 'Mapa de tiendas' })).toBeVisible()
    await expect(page.locator('.nf-map-container .nf-marker')).toHaveCount(2)
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/checklist-map-completed-mobile.png', fullPage: true })
  await page.getByRole('button', { name, exact: true }).click()
  await expect(page).toHaveURL(`/checklists/${String(selected.id)}`)
  await expect(page.getByRole('heading', { name: name, exact: true })).toBeVisible()

  for (const key of ['Enter', 'Space']) {
    await page.goto('/checklists')
    await expect(page.locator('.nf-map-status')).toHaveCount(0)
    await page.getByRole('button', { name, exact: true }).focus()
    await page.keyboard.press(key)
    await expect(page).toHaveURL(`/checklists/${String(selected.id)}`)
  }
})

test('desde Finalizados el marcador prioriza un trabajo activo de la misma tienda', async ({
  page,
  request,
}) => {
  const fixture = isolatedCase()
  const token = await access(request, fixture.username)
  const [completedId, activeId] = fixture.visitIds
  await complete(request, token, completedId)
  const active = await start(request, token, activeId)
  try {
    await login(page, fixture.username)
    await page.getByRole('button', { name: 'Finalizados', exact: true }).click()
    await expect(page.locator('.nf-map-status')).toHaveCount(0)
    await expect(page.locator('.nf-map-container .nf-marker')).toHaveCount(2)
    await page
      .getByRole('button', { name: string(object(active.storeSnapshot).name), exact: true })
      .click()
    await expect(page).toHaveURL(`/checklists/${activeId}`)
  } finally {
    await call(request, `/visitas/${activeId}/no-realizada/`, token, {
      reason: 'Fin del caso ficticio de navegación del mapa E2E.',
    })
  }
})

test('sin visitas accesibles se explica por qué el mapa está vacío', async ({ page }) => {
  const fixture = isolatedCase(true)
  await login(page, fixture.username)
  await expect(page.getByRole('region', { name: 'Mapa de tiendas' })).toBeVisible()
  await expect(page.getByText(/No hay ubicaciones válidas/)).toBeVisible()
  await expect(page.locator('.nf-map-container')).toHaveCount(0)
})
