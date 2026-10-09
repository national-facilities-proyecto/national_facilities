import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { displayDate, operationDate } from '../src/utils/dates.js'
import { access, api, call, jpeg, login, object, python, string } from './helpers.js'

function isolatedCase(mode: 'normal' | 'empty' | 'no-visits' = 'normal') {
  const raw: unknown = JSON.parse(
    execFileSync(
      python,
      [
        resolve('../backend/test_support/checklist_map_case.py'),
        ...(mode === 'normal' ? [] : ['--' + mode]),
      ],
      { cwd: resolve('..'), encoding: 'utf8' },
    ),
  )
  const data = object(raw)
  if (!Array.isArray(data.visitIds) || !data.visitIds.every((id) => typeof id === 'number'))
    throw new Error('IDs de visitas inválidos.')
  return {
    username: string(data.username),
    peerUsername: typeof data.peerUsername === 'string' ? data.peerUsername : '',
    supervisorUsername: typeof data.supervisorUsername === 'string' ? data.supervisorUsername : '',
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

test('cobertura sin visitas: mapa independiente de tres pestañas y popup de indicaciones reales', async ({
  page,
  request,
}) => {
  const fixture = isolatedCase('no-visits')
  const token = await access(request, fixture.username)
  const raw = await call(request, '/tiendas/', token)
  if (!Array.isArray(raw)) throw new Error('Tiendas inválidas.')
  expect(raw).toHaveLength(2)
  const store = object(raw[0])
  await login(page, fixture.username)
  await expect(page.locator('.nf-map-status')).toHaveCount(0)
  await expect(page.getByText('No tienes checklists disponibles por ahora.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mis trabajos', exact: true })).toHaveCount(0)
  for (const tab of ['Bolsa compartida', 'En revisión', 'Finalizados']) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    await expect(page.locator('.nf-map-container .nf-marker')).toHaveCount(2)
  }
  expect(await call(request, '/checklists/', token)).toEqual([])
  for (const key of ['click', 'Enter', 'Space']) {
    const marker = page.getByRole('button', { name: string(store.name), exact: true })
    if (key === 'click') await marker.click()
    else {
      await marker.focus()
      await page.keyboard.press(key)
    }
    const popup = page.locator('.leaflet-popup-content')
    await expect(popup.getByText(string(store.name), { exact: true })).toBeVisible()
    await expect(popup.getByText(string(store.address), { exact: true })).toBeVisible()
    await expect(popup.getByRole('link', { name: 'Cómo llegar', exact: true })).toHaveAttribute(
      'href',
      `https://www.google.com/maps/dir/?api=1&destination=${Number(store.latitude)},${Number(store.longitude)}`,
    )
    await expect(page.getByText(/Ver checklist|Ver tienda/)).toHaveCount(0)
    await expect(page).toHaveURL('/checklists')
    await page.getByRole('button', { name: 'Close popup' }).click()
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/coverage-map-no-visits-mobile.png', fullPage: true })
})

test('finalizaciones propias: otro técnico de la misma cobertura ve tiendas pero no las visitas', async ({
  page,
  request,
  context,
}) => {
  const fixture = isolatedCase()
  const token = await access(request, fixture.username)
  for (const id of fixture.visitIds) await complete(request, token, id)
  await login(page, fixture.username)
  await page.getByRole('button', { name: 'Finalizados', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Ver detalle', exact: true })).toHaveCount(4)
  await expect(page.locator('.nf-map-container .nf-marker')).toHaveCount(2)
  const peerToken = await access(request, fixture.peerUsername)
  expect(await call(request, '/checklists/', peerToken)).toEqual([])
  const denied = await request.get(`${api}/visitas/${fixture.visitIds[0]}/`, {
    headers: { Authorization: `Bearer ${peerToken}` },
  })
  expect(denied.status()).toBe(404)
  const peerPage = await context.newPage()
  await login(peerPage, fixture.peerUsername)
  await peerPage.getByRole('button', { name: 'Finalizados', exact: true }).click()
  await expect(peerPage.getByText('No tienes checklists finalizados.')).toBeVisible()
  await expect(peerPage.getByRole('link', { name: 'Ver detalle', exact: true })).toHaveCount(0)
  await expect(peerPage.locator('.nf-map-container .nf-marker')).toHaveCount(2)
  await peerPage.close()
})

test('recuperación después de cerrar y volver a entrar: trabajo activo y reserva sin pestaña Mis trabajos', async ({
  page,
  request,
  context,
}) => {
  const fixture = isolatedCase()
  const token = await access(request, fixture.username)
  const [activeId, , reservedId] = fixture.visitIds
  await start(request, token, activeId)
  await call(request, `/visitas/pool/${reservedId}/tomar/`, token, {})
  try {
    await login(page, fixture.username)
    const recovery = page.getByRole('region', { name: 'Recuperación de trabajos' })
    await expect(recovery.locator(`a[href="/checklists/${activeId}/start"]`)).toBeVisible()
    await expect(recovery.locator(`a[href="/checklists/${reservedId}"]`)).toBeVisible()
    await page.close()
    const reopened = await context.newPage()
    await login(reopened, fixture.username)
    const recovered = reopened.getByRole('region', { name: 'Recuperación de trabajos' })
    await recovered.locator(`a[href="/checklists/${activeId}/start"]`).click()
    await expect(
      reopened.getByRole('heading', { name: 'Recorrido de inspección', exact: true }),
    ).toBeVisible()
    await reopened.goto('/checklists')
    await reopened
      .getByRole('region', { name: 'Recuperación de trabajos' })
      .locator(`a[href="/checklists/${reservedId}"]`)
      .click()
    await expect(
      reopened.getByRole('button', { name: 'Registrar llegada', exact: true }),
    ).toBeVisible()
    await reopened.close()
  } finally {
    await call(request, `/visitas/${activeId}/no-realizada/`, token, {
      reason: 'Fin del caso ficticio de recuperación de trabajo.',
    })
  }
})

test('sin cobertura activa no hay ubicaciones ajenas y se explica la ausencia de tiendas', async ({
  page,
}) => {
  const fixture = isolatedCase('empty')
  await login(page, fixture.username)
  await expect(page.getByText('No tienes tiendas asignadas por ahora.')).toBeVisible()
  await expect(page.getByText('No tienes checklists disponibles por ahora.')).toBeVisible()
  await expect(page.locator('.nf-map-container')).toHaveCount(0)
})

test('revisión propia, GPS sin duplicación y fecha real de ejecución del supervisor', async ({
  page,
  request,
  context,
}) => {
  const fixture = isolatedCase()
  const token = await access(request, fixture.username)
  const id = fixture.visitIds[0]
  await call(request, `/visitas/pool/${id}/tomar/`, token, {})
  const upload = await request.post(api + '/evidencias/', {
    headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': crypto.randomUUID() },
    multipart: {
      id: crypto.randomUUID(),
      visitId: String(id),
      purpose: 'arrival',
      source: 'camera',
      capturedAt: new Date().toISOString(),
      foto: { name: 'arrival.jpg', mimeType: 'image/jpeg', buffer: jpeg },
    },
  })
  expect(upload.ok(), await upload.text()).toBe(true)
  const evidenceId = string(object(await upload.json()).id)
  const reason = 'El dispositivo ficticio no concedió permiso para GPS.'
  await call(request, `/visitas/${id}/excepciones/`, token, {
    type: 'location',
    scope: 'arrival',
    failure: 'denied',
    reason,
    evidenceId,
    location: null,
  })
  await call(request, `/visitas/${id}/terminar/`, token, {})
  const opened = object(await call(request, `/visitas/${id}/formulario/`, token, {}))
  if (!Array.isArray(opened.tasks)) throw new Error('Tareas inválidas.')
  const saved = object(
    await call(request, `/visitas/${id}/borrador/`, token, {
      revision: opened.revision,
      answers: opened.tasks.map((task) => ({
        taskId: object(task).id,
        result: 'conforme',
        observation: '',
        evidenceIds: [],
      })),
      evidenceIds: [],
      workDescription: '',
    }),
  )
  const submitted = object(
    await call(request, `/visitas/${id}/enviar-revision/`, token, {
      revision: saved.revision,
      exceptions: [],
    }),
  )
  expect(submitted.phase).toBe('in_review')
  await login(page, fixture.username)
  await page.getByRole('button', { name: 'En revisión', exact: true }).click()
  await expect(page.locator(`a[href="/checklists/${id}"]`)).toBeVisible()
  await page.goto(`/checklists/${id}/start`)
  await expect(page.getByText(reason, { exact: true })).toHaveCount(1)
  await expect(page.getByText('Historial de excepciones', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Detalles técnicos', { exact: true })).toHaveCount(0)
  const peerToken = await access(request, fixture.peerUsername)
  const peerVisits = await call(request, '/checklists/', peerToken)
  if (!Array.isArray(peerVisits)) throw new Error('Visitas inválidas.')
  expect(peerVisits.map(object).some((visit) => visit.id === id)).toBe(false)
  const denied = await request.get(`${api}/visitas/${id}/`, {
    headers: { Authorization: `Bearer ${peerToken}` },
  })
  expect(denied.status()).toBe(404)
  const peerPage = await context.newPage()
  await login(peerPage, fixture.peerUsername)
  await peerPage.getByRole('button', { name: 'En revisión', exact: true }).click()
  await expect(peerPage.getByText('No tienes checklists en revisión.')).toBeVisible()
  await peerPage.close()
  const reviewer = await context.newPage()
  await login(reviewer, fixture.supervisorUsername)
  await reviewer.goto('/technical-supervisor/checklists')
  await expect(
    reviewer
      .getByText('Ejecutada: ' + displayDate(string(submitted.startedAt)))
      .filter({ visible: true }),
  ).toBeVisible()
  const executionDate = operationDate(new Date(string(submitted.startedAt)))
  await reviewer.getByLabel('Fecha de ejecución o programación desde').fill(executionDate)
  await reviewer.getByLabel('Fecha de ejecución o programación hasta').fill(executionDate)
  await reviewer
    .locator(`a[href="/technical-supervisor/checklists/${id}"]`)
    .filter({ visible: true })
    .click()
  await expect(reviewer.getByText(reason, { exact: true })).toHaveCount(1)
  await expect(reviewer.getByRole('button', { name: 'Aprobar', exact: true })).toBeVisible()
  await expect(reviewer.getByText('Historial de excepciones', { exact: true })).toHaveCount(0)
  await reviewer.getByText('Detalles técnicos', { exact: true }).click()
  await expect(reviewer.getByText(reason, { exact: true })).toHaveCount(1)
  await expect(reviewer.getByText('ID de la excepción', { exact: true })).toBeVisible()
  await reviewer.close()
})
