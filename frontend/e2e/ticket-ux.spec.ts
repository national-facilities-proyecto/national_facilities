import { expect, test, type APIRequestContext } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { operationDate } from '../src/utils/dates.js'
import { access, api, call, cameraPhoto, jpeg, login, object, python, string } from './helpers.js'

let currentVisit: number | undefined
test.afterEach(async ({ request }) => {
  if (!currentVisit) return
  const token = await access(request, 'tech')
  const visit = object(await call(request, `/visitas/${currentVisit}/`, token))
  if (['claimed', 'in_progress', 'correction_required'].includes(String(visit.status))) {
    const cleanupToken = visit.phase === 'scheduled' ? await access(request, 'account') : token
    await call(request, `/visitas/${currentVisit}/no-realizada/`, cleanupToken, {
      reason: 'Prueba aislada interrumpida; se conserva el intento y su auditoría.',
    })
  }
  currentVisit = undefined
})
async function ticketCase(request: APIRequestContext) {
  const storeToken = await access(request, 'store')
  const accountToken = await access(request, 'account')
  const techToken = await access(request, 'tech')
  const stores = await call(request, '/tiendas/', storeToken)
  const catalogs = object(await call(request, '/catalogos/', storeToken))
  const users = await call(request, '/usuarios/', accountToken)
  if (
    !Array.isArray(stores) ||
    !Array.isArray(users) ||
    !Array.isArray(catalogs.categories) ||
    !Array.isArray(catalogs.priorities)
  )
    throw new Error('Fixtures locales incompatibles.')
  const technicianId = users.map(object).find((user) => user.username === 'tech')?.id
  const priorityId = object(catalogs.priorities[0]).id
  const ticket = object(
    await call(request, '/tickets/', storeToken, {
      storeId: object(stores[0]).id,
      categoryId: object(catalogs.categories[0]).id,
      priorityId,
      description: 'Prueba aislada de programación y recuperación de atención.',
      evidenceIds: [],
    }),
  )
  return { storeToken, accountToken, techToken, technicianId, priorityId, ticket }
}

for (const width of [320, 390, 1440]) {
  test(`ticket ${width}px: reporte, reemplazo confirmado, miniaturas, filtros, teclado y seguimiento MASS`, async ({
    browser,
    request,
  }) => {
    const device = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: width < 1440,
      isMobile: width < 1440,
      permissions: ['camera'],
    })
    const page = await device.newPage()
    const reporter = object(
      JSON.parse(
        execFileSync(python, [resolve('../backend/test_support/ticket_reporter.py')], {
          cwd: resolve('..'),
          encoding: 'utf8',
        }),
      ),
    )
    const username = string(reporter.username)
    await login(page, username)
    await page.goto('/supervisor/tickets/new')
    await page.getByLabel('Especialidad', { exact: true }).selectOption({ label: 'Eléctrico' })
    await page.getByLabel('Prioridad', { exact: true }).selectOption({ label: 'Alta' })
    const description = `Reporte móvil aislado de una luminaria ${width}px ${crypto.randomUUID()}.`
    await page.getByLabel('Descripción del problema').fill(description)
    await expect(page.getByText('También puedes arrastrar archivos aquí.')).toHaveCount(0)
    const cameraUpload = page.waitForResponse(
      (response) =>
        response.url() === api + '/evidencias/' &&
        response.request().method() === 'POST' &&
        response.ok(),
    )
    await cameraPhoto(page)
    const photo = object(await (await cameraUpload).json())
    expect(photo.source).toBe('camera')
    expect(typeof photo.capturedAt).toBe('string')
    await expect(page.locator('.nf-evidence img')).toHaveCount(1)
    const galleryChooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Seleccionar fotografías', exact: true }).click()
    await (
      await galleryChooser
    ).setFiles(
      [1, 2, 3, 4].map((index) => ({
        name: `galeria-${index}.jpg`,
        mimeType: 'image/jpeg',
        buffer: jpeg,
      })),
    )
    await expect(page.locator('.nf-evidence img')).toHaveCount(5)
    const confirmedUploads: string[] = []
    page.on('response', (response) => {
      if (
        response.url() === api + '/evidencias/' &&
        response.request().method() === 'POST' &&
        response.ok()
      )
        confirmedUploads.push(response.url())
    })
    await page.getByRole('button', { name: 'Reemplazar fotografía' }).first().click()
    await page
      .getByLabel('Fotografías del reporte', { exact: true })
      .setInputFiles({ name: 'reemplazo.jpg', mimeType: 'image/jpeg', buffer: jpeg })
    await expect(page.locator('.nf-evidence img')).toHaveCount(5)
    await expect.poll(() => confirmedUploads.length).toBe(1)
    const zoom = page.getByRole('button', { name: /Ampliar fotografía/ }).first()
    await zoom.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Fotografía ampliada' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(zoom).toBeFocused()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByRole('button', { name: 'Enviar reporte', exact: true }).click()
    await expect(page).toHaveURL(/\/supervisor\/tickets\/\d+$/)
    const ticketId = Number(page.url().split('/').at(-1))
    const ticket = object(
      await call(request, `/tickets/${ticketId}/`, await access(request, username)),
    )
    expect(ticket.evidenceIds).toHaveLength(5)
    expect(confirmedUploads).toHaveLength(1)
    await expect(page.getByLabel('Técnico asignado', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Aprobar', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Resolución del técnico' })).toHaveCount(0)
    await page.goto('/supervisor/tickets')
    await page.getByLabel('Buscar incidencias').fill(description)
    await expect(page.getByText('1 incidencias', { exact: true })).toBeVisible()
    if (width < 1440) {
      const card = page.locator('.nf-ticket-card')
      await expect(card).toHaveCount(1)
      await expect(card.locator('h2')).toBeVisible()
      await expect(card.locator('dt')).toHaveCount(0)
      await expect(page.getByLabel('Estado', { exact: true })).toBeHidden()
      await page.getByRole('button', { name: /^Filtros/ }).click()
    }
    await expect(page.getByLabel('Estado', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Limpiar filtros' }).click()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await device.close()
  })
}

test('día de Lima: futuro bloqueado, reprogramación, GPS, fin físico recuperable y revisión autorizada finalizan ticket', async ({
  page,
  request,
  browser,
  context,
}) => {
  const data = await ticketCase(request)
  const supervisorContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    timezoneId: 'Asia/Tokyo',
  })
  const supervisor = await supervisorContext.newPage()
  await login(supervisor, 'account')
  await supervisor.goto(`/technical-supervisor/incidents/${String(data.ticket.id)}`)
  await supervisor
    .getByLabel('Técnico asignado', { exact: true })
    .selectOption(String(data.technicianId))
  const tomorrow = operationDate(new Date(Date.now() + 86400000))
  await supervisor.getByLabel('Fecha de atención').fill(tomorrow)
  await supervisor.getByRole('button', { name: 'Programar visita', exact: true }).click()
  await expect(
    supervisor.getByRole('button', { name: 'Guardar reprogramación', exact: true }),
  ).toBeVisible()
  let ticket = object(await call(request, `/tickets/${String(data.ticket.id)}/`, data.accountToken))
  if (typeof ticket.visitId !== 'number') throw new Error('Sin atención.')
  currentVisit = ticket.visitId
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.goto(`/routes/${ticket.visitId}`)
  await expect(page.getByText(/Puedes registrar llegada desde ese día/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Registrar llegada', exact: true })).toHaveCount(0)
  const blocked = await request.post(`${api}/visitas/${ticket.visitId}/iniciar/`, {
    headers: { Authorization: 'Bearer ' + data.techToken, 'Idempotency-Key': crypto.randomUUID() },
    data: {
      location: { latitude: -12.1739, longitude: -77.0181, accuracy: 8, capturedAt: Date.now() },
    },
  })
  expect(blocked.status()).toBe(409)
  expect(await blocked.text()).not.toContain('scheduledAt')
  await supervisor.getByLabel('Fecha de atención').fill(operationDate())
  await supervisor
    .getByLabel('Motivo de reprogramación o reasignación')
    .fill('Cambio de disponibilidad para atender durante el día de hoy.')
  await supervisor.getByRole('button', { name: 'Guardar reprogramación', exact: true }).click()
  await expect(supervisor.getByText('Atención reprogramada', { exact: true })).toBeVisible()
  await expect(
    supervisor.getByText('Motivo: Cambio de disponibilidad para atender durante el día de hoy.', {
      exact: true,
    }),
  ).toHaveCount(1)
  ticket = object(await call(request, `/tickets/${String(data.ticket.id)}/`, data.accountToken))
  if (typeof ticket.visitId !== 'number') throw new Error('Sin atención reprogramada.')
  currentVisit = ticket.visitId
  await context.setGeolocation({ latitude: -12.3, longitude: -77.3, accuracy: 8 })
  await page.goto(`/routes/${ticket.visitId}`)
  await page.getByRole('button', { name: 'Registrar llegada', exact: true }).click()
  await page.getByRole('button', { name: 'Solicitar excepción GPS', exact: true }).click()
  await expect(page.getByText('Escribe al menos 10 caracteres.')).toBeVisible()
  await page
    .getByLabel('Motivo de la excepción')
    .fill('La ubicación del dispositivo no coincide con el establecimiento.')
  await cameraPhoto(page, 'Tomar foto del establecimiento')
  await page.getByRole('button', { name: 'Guardar excepción GPS', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Atención en curso' })).toBeVisible()
  let failOpening = true
  let physicalRequests = 0
  page.on('request', (request) => {
    if (request.url().endsWith(`/visitas/${String(ticket.visitId)}/terminar/`)) physicalRequests++
  })
  await page.route(`**/visitas/${ticket.visitId}/formulario/`, async (route) => {
    if (failOpening) {
      failOpening = false
      await route.abort()
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Registrar resultado del trabajo' }).click()
  await expect(page.getByRole('alert').filter({ hasText: /No se pudo conectar/ })).toBeVisible()
  const ended = object(await call(request, `/visitas/${ticket.visitId}/`, data.techToken))
  expect(ended.phase).toBe('physical_finished')
  expect(ended.formOpenedAt).toBeNull()
  await page.reload()
  await page.getByRole('button', { name: 'Registrar resultado del trabajo' }).click()
  await page
    .getByLabel('Descripción del trabajo realizado')
    .fill('Componente reparado; funcionamiento seguro comprobado.')
  await cameraPhoto(page)
  const form = object(await call(request, `/visitas/${ticket.visitId}/`, data.techToken))
  expect(form.physicalEndedAt).toBe(ended.physicalEndedAt)
  expect(physicalRequests).toBe(1)
  await expect(
    page.getByText(
      /requisitos pendientes|Borrador guardado|en este navegador|pendientes de asociación/,
    ),
  ).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Descripción del trabajo realizado')).toHaveValue(
    'Componente reparado; funcionamiento seguro comprobado.',
  )
  await expect(page.locator('.nf-evidence img')).toHaveCount(2)
  await page.getByRole('button', { name: 'Enviar a revisión', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar envío', exact: true }).click()
  await page.getByRole('link', { name: /Volver al listado/ }).click()
  await page.goto(`/routes/${ticket.visitId}`)
  await expect(page.getByRole('heading', { name: 'En revisión', exact: true })).toBeVisible()
  await expect(page.getByText('Historial de excepciones', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Detalles técnicos', { exact: true })).toHaveCount(0)
  const other = await request.get(`${api}/visitas/${ticket.visitId}/`, {
    headers: { Authorization: 'Bearer ' + (await access(request, 'othertech')) },
  })
  expect(other.status()).toBe(404)
  await supervisor.reload()
  await supervisor.getByRole('link', { name: 'Revisar excepción GPS pendiente' }).click()
  await supervisor.getByRole('button', { name: 'Aprobar', exact: true }).click()
  await supervisor.getByLabel('Motivo de aprobación').fill('Ver')
  await supervisor.getByRole('button', { name: 'Confirmar decisión', exact: true }).click()
  await expect(supervisor.getByLabel('Motivo de aprobación')).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  expect(
    object(await call(request, `/tickets/${String(data.ticket.id)}/`, data.accountToken)).status,
  ).toBe('pending_approval')
  await supervisor
    .getByLabel('Motivo de aprobación')
    .fill('Evidencia verificada; atención correctamente documentada.')
  await supervisor.getByRole('button', { name: 'Confirmar decisión', exact: true }).click()
  await expect
    .poll(
      async () =>
        object(await call(request, `/tickets/${String(data.ticket.id)}/`, data.accountToken))
          .status,
    )
    .toBe('resolved')
  await page.goto('/routes')
  await page.getByRole('button', { name: 'Finalizadas', exact: true }).click()
  await expect(page.locator(`a[href="/routes/${ticket.visitId}"]`)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Mapa de tiendas' })).toBeVisible()
  expect((await new AxeBuilder({ page: supervisor }).analyze()).violations).toEqual([])
  await supervisorContext.close()
})
