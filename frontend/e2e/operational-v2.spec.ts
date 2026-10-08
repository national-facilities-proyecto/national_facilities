import { test, expect } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import {
  access,
  api,
  arrive,
  arrivalException,
  call,
  cameraPhoto,
  checklistCase,
  login,
  object,
  openResults,
} from './helpers.js'

let currentId: number | undefined
test.beforeEach(() => {
  currentId = undefined
})
test.afterEach(async ({ request }, info) => {
  if (info.status === info.expectedStatus || currentId === undefined) return
  const token = await access(request, 'tech')
  const state = object(await call(request, `/visitas/${currentId}/`, token))
  if (['claimed', 'in_progress', 'correction_required'].includes(String(state.status)))
    await call(request, `/visitas/${currentId}/no-realizada/`, token, {
      reason: 'Caso ficticio interrumpido por una regresión E2E; se conserva historial.',
    })
})

test('operativo móvil: llegada única, selección clara y foto confirmada con reintento solo de borrador', async ({
  page,
  request,
}) => {
  currentId = checklistCase()
  const token = await access(request, 'tech')
  await page.setViewportSize({ width: 360, height: 800 })
  await login(page)
  const mutations: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/(tomar|iniciar)\/$/.test(request.url()))
      mutations.push(request.url().endsWith('/tomar/') ? 'claim' : 'start')
  })
  await arrive(page, currentId)
  expect(mutations).toEqual(['claim', 'start'])
  await expect(page.getByText(/Historial de reservas|Reserva hasta|Tomar checklist/)).toHaveCount(0)
  await page.screenshot({ path: 'test-results/operational-walkthrough-mobile.png', fullPage: true })
  await openResults(page)
  const options = page.getByRole('group', { name: 'Resultado de Inspect test device' })
  await expect(options.getByRole('button', { pressed: true })).toHaveCount(0)
  await expect(options.getByRole('button', { name: 'Conforme', exact: true })).toHaveText(
    'Conforme',
  )
  await page.getByRole('button', { name: 'Finalizar', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Requisitos de Inspect test device' })).toContainText(
    'Fotografía obligatoria',
  )
  await expect(page.getByText(/No se confirmó el guardado/)).toHaveCount(0)
  await options.getByRole('button', { name: 'Conforme', exact: true }).click()
  await expect(options.getByRole('button', { pressed: true })).toHaveCount(1)
  await expect(page.getByText('Borrador guardado.', { exact: true })).toBeVisible()
  let uploads = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url() === `${api}/evidencias/`) uploads++
  })
  let failed = false
  await page.route(`${api}/visitas/${currentId}/borrador/`, async (route) => {
    if (!failed && uploads > 0) {
      failed = true
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Borrador temporalmente no disponible.' }),
      })
    } else await route.continue()
  })
  await cameraPhoto(page)
  await expect(
    page.getByText('La foto está guardada. Falta confirmar el guardado del resto del registro.'),
  ).toBeVisible()
  const stored = object(await call(request, `/visitas/${currentId}/`, token))
  const answers = (stored.answers as unknown[]).map(object)
  expect(answers[0].evidenceIds).toHaveLength(1)
  await expect(page.getByRole('button', { name: 'Reintentar carga', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Reintentar guardado', exact: true }).click()
  await expect(page.getByText('Borrador guardado.', { exact: true })).toBeVisible()
  expect(uploads).toBe(1)
  await expect(
    page.getByText('La foto está guardada. Falta confirmar el guardado del resto del registro.'),
  ).toHaveCount(0)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/operational-results-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Finalizar', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar envío', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Trabajo finalizado' })).toBeVisible()
  expect(object(await call(request, `/visitas/${currentId}/`, token)).status).toBe('completed')
})

test('supervisor móvil: evidencia y decisión visibles, auditoría cerrada y validación junto al campo', async ({
  page,
  context,
  request,
}) => {
  currentId = checklistCase()
  const token = await access(request, 'tech')
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: PositionCallback, error: PositionErrorCallback) =>
          error({ code: 1 } as GeolocationPositionError),
      },
    }),
  )
  await login(page)
  await arrivalException(page, currentId)
  await openResults(page)
  await page.getByRole('button', { name: 'No aplica', exact: true }).click()
  await page
    .getByLabel('Descripción obligatoria')
    .fill('Este dispositivo no se encuentra instalado.')
  await page.getByRole('button', { name: 'Guardar observación', exact: true }).click()
  await page.getByRole('button', { name: 'Enviar a revisión', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar envío', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'En revisión', exact: true })).toBeVisible()
  const reviewer = await context.newPage()
  await reviewer.setViewportSize({ width: 390, height: 844 })
  await login(reviewer, 'account')
  await reviewer.goto(`/technical-supervisor/checklists/${currentId}`)
  const pending = reviewer.getByRole('region', { name: 'Excepciones pendientes' })
  await expect(pending.getByRole('button', { name: 'Aprobar', exact: true })).toBeVisible()
  await expect(pending.getByRole('button', { name: 'Rechazar', exact: true })).toBeVisible()
  await expect(pending.locator('.nf-evidence img')).toHaveCount(1)
  await expect(reviewer.getByText(/out_of_radius|Historial de reservas/)).toHaveCount(0)
  await expect(
    reviewer.getByText('Detalles técnicos', { exact: true }).locator('..'),
  ).not.toHaveAttribute('open')
  await expect(
    reviewer.getByText('Resultados del checklist y trabajo', { exact: true }).locator('..'),
  ).not.toHaveAttribute('open')
  expect((await new AxeBuilder({ page: reviewer }).analyze()).violations).toEqual([])
  await reviewer.screenshot({
    path: 'test-results/operational-supervisor-mobile.png',
    fullPage: true,
  })
  await pending.getByRole('button', { name: 'Aprobar', exact: true }).click()
  const modal = reviewer.getByRole('dialog', { name: 'Aprobar excepción' })
  await expect(modal).toContainText('El permiso de ubicación no estuvo disponible al llegar.')
  await modal.getByRole('button', { name: 'Confirmar decisión', exact: true }).click()
  await expect(modal.getByLabel('Motivo de aprobación')).toHaveAttribute('aria-invalid', 'true')
  await expect(modal.getByRole('alert')).toContainText('al menos 10 caracteres')
  await modal.getByLabel('Motivo de aprobación').fill('Fotografía del establecimiento verificada.')
  const response = reviewer.waitForResponse(
    (response) =>
      response.url() === `${api}/visitas/${currentId}/revisar/` &&
      response.request().method() === 'POST',
  )
  await modal.getByRole('button', { name: 'Confirmar decisión', exact: true }).click()
  expect((await response).ok()).toBe(true)
  await expect(reviewer.getByRole('heading', { name: 'Sin excepciones pendientes' })).toBeVisible()
  const final = object(await call(request, `/visitas/${currentId}/`, token))
  expect(final.status).toBe('completed')
  const exceptions = (final.exceptions as unknown[]).map(object)
  expect(exceptions[0].approved).toBe(true)
  expect(exceptions[0].reviewReason).toBe('Fotografía del establecimiento verificada.')
  await reviewer.close()
})
