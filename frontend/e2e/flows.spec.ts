import { test, expect } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import {
  login,
  access,
  call,
  api,
  password,
  object,
  checklistCase,
  visit,
  advance,
  upload,
  scheduledMapVisit,
  mapVisit,
  arrive,
  openResults,
  arrivalException,
  waitUntilScheduled,
} from './helpers.js'
import type { APIRequestContext, Page } from '@playwright/test'

// Un fallo conserva su intento y libera exclusivamente el caso ficticio creado aquí.
let currentCaseId: number | undefined
test.beforeEach(() => {
  currentCaseId = undefined
})
test.afterEach(async ({ request }, info) => {
  if (info.status === info.expectedStatus || currentCaseId === undefined) return
  const token = await access(request, 'tech')
  const current = object(await call(request, `/visitas/${currentCaseId}/`, token))
  if (['claimed', 'in_progress', 'correction_required'].includes(String(current.status)))
    await call(request, `/visitas/${currentCaseId}/no-realizada/`, token, {
      reason: 'Intento ficticio interrumpido por un fallo E2E; se conserva su historial.',
    })
})

async function setup(request: APIRequestContext, origin: 'checklist' | 'ticket') {
  const token = await access(request, 'tech')
  if (origin === 'checklist') {
    currentCaseId = checklistCase()
    return { id: currentCaseId, token, path: '/checklists/' }
  }
  const storeToken = await access(request, 'store')
  const stores: unknown = await call(request, '/tiendas/', storeToken)
  if (!Array.isArray(stores) || !stores.length) throw new Error('Sin tienda aislada.')
  const store = object(stores[0])
  const catalogs = object(await call(request, '/catalogos/', storeToken))
  if (!Array.isArray(catalogs.categories) || !Array.isArray(catalogs.priorities))
    throw new Error('Sin catálogo.')
  const ticket = object(
    await call(request, '/tickets/', storeToken, {
      storeId: store.id,
      categoryId: object(catalogs.categories[0]).id,
      priorityId: object(catalogs.priorities[0]).id,
      description: 'Real recovery test for an electrical fault.',
      evidenceIds: [],
    }),
  )
  const accountToken = await access(request, 'account')
  const rawUsers = await call(request, '/usuarios/', accountToken)
  if (!Array.isArray(rawUsers)) throw new Error('Usuarios incompatibles.')
  const tech = rawUsers.map(object).find((user) => user.username === 'tech')
  const scheduled = object(
    await call(request, '/tickets/' + String(ticket.id) + '/programar/', accountToken, {
      technicianId: tech?.id,
      scheduledAt: new Date(Date.now() + 1000).toISOString(),
      priorityId: object(catalogs.priorities[0]).id,
      reason: '',
      revision: 0,
    }),
  )
  if (typeof scheduled.visitId !== 'number') throw new Error('Sin visita.')
  await waitUntilScheduled(request, scheduled.visitId, token)
  currentCaseId = scheduled.visitId
  return { id: currentCaseId, token, path: '/routes/' }
}
async function start(page: Page, id: number, path: string) {
  await arrive(page, id, path === '/checklists/' ? 'checklist' : 'ticket')
}
async function form(page: Page, origin: 'checklist' | 'ticket') {
  await openResults(page, origin)
  if (origin === 'checklist')
    await page.getByRole('button', { name: 'Conforme', exact: true }).click()
  else
    await page
      .getByLabel('Descripción del trabajo realizado')
      .fill('Completed repair and checked device operation.')
  await upload(page)
}

for (const origin of ['checklist', 'ticket'] as const) {
  test(
    origin + ': cierre de pestaña, conexión perdida, sesión expirada y formulario sin plazo',
    async ({ page, context, request, browser }) => {
      const data = await setup(request, origin)
      await login(page)
      await start(page, data.id, data.path)
      expect((await visit(request, data.id, data.token)).formOpenedAt).toBeUndefined()
      await page.close()
      let editor = await context.newPage()
      await login(editor)
      await editor.goto(
        origin === 'checklist' ? data.path + data.id + '/start' : data.path + data.id,
      )
      await expect(
        editor.getByRole('heading', {
          name: origin === 'checklist' ? 'Recorrido de inspección' : 'Atención en curso',
        }),
      ).toBeVisible()
      await form(editor, origin)
      const original = (await visit(request, data.id, data.token)).expiresAt
      await editor.close()
      editor = await context.newPage()
      await login(editor)
      await editor.goto(
        origin === 'checklist' ? data.path + data.id + '/start' : data.path + data.id,
      )
      await expect(editor.locator('.nf-evidence img')).toHaveCount(1)
      expect((await visit(request, data.id, data.token)).expiresAt).toBe(original)
      await context.setOffline(true)
      if (origin === 'ticket')
        await editor
          .getByLabel('Descripción del trabajo realizado')
          .fill('Local edits remain during network loss.')
      else {
        await editor.getByRole('button', { name: 'No conforme', exact: true }).click()
        await editor
          .getByLabel('Descripción obligatoria')
          .fill('Local edits remain during network loss.')
        await editor.getByRole('button', { name: 'Guardar observación', exact: true }).click()
      }
      await expect(
        editor.getByRole('alert').filter({ hasText: /No se pudo conectar/ }),
      ).toBeVisible()
      await expect(
        editor.getByText('No se confirmó el guardado. Conserva el editor y reintenta.'),
      ).toBeVisible()
      await context.setOffline(false)
      await editor
        .getByRole('button', {
          name: origin === 'ticket' ? 'Reintentar guardado' : 'Guardar borrador',
          exact: true,
        })
        .click()
      if (origin === 'checklist')
        await expect(editor.getByText('Borrador guardado.', { exact: true })).toBeVisible()
      else
        await expect
          .poll(async () => (await visit(request, data.id, data.token)).workDescription)
          .toBe('Local edits remain during network loss.')
      const revoked = await request.post(api + '/auth/logout/', {
        headers: { Authorization: 'Bearer ' + data.token },
      })
      expect(revoked.status()).toBe(204)
      await editor
        .getByRole('button', {
          name: origin === 'ticket' ? 'Enviar registro' : 'Finalizar',
          exact: true,
        })
        .click()
      await expect(editor.getByRole('dialog', { name: 'Recuperar sesión' })).toBeVisible()
      await editor.getByLabel('Contraseña para recuperar sesión', { exact: true }).fill(password)
      const recoveredVisit = editor.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          response.url() === `${api}/visitas/${data.id}/` &&
          response.ok(),
      )
      await editor.getByRole('button', { name: 'Autenticar y continuar' }).click()
      await recoveredVisit
      await expect(editor.getByRole('dialog', { name: 'Recuperar sesión' })).not.toBeVisible()
      const conflict = editor.getByRole('heading', { name: 'Borrador modificado en otra sesión' })
      const saved = editor.getByText('Borrador guardado.', { exact: true })
      const saveButton = editor.getByRole('button', { name: 'Guardar borrador', exact: true })
      const renewed = await access(request, 'tech')
      if (origin === 'ticket') {
        await expect
          .poll(
            async () =>
              (await conflict.isVisible()) ||
              (await visit(request, data.id, renewed)).workDescription ===
                'Local edits remain during network loss.',
          )
          .toBe(true)
      } else {
        await expect
          .poll(async () => (await conflict.isVisible()) || (await saveButton.isEnabled()))
          .toBe(true)
        if (!(await conflict.isVisible())) await saveButton.click()
        await expect(saved.or(conflict)).toBeVisible()
      }
      if (await conflict.isVisible()) {
        // La reautenticación puede coincidir con el autosave. Verifica el contenido antes de conciliar.
        const current = object(
          await call(request, `/visitas/${data.id}/`, await access(request, 'tech')),
        )
        if (origin === 'ticket')
          expect(current.workDescription).toBe('Local edits remain during network loss.')
        else {
          const answers = Array.isArray(current.answers) ? current.answers.map(object) : []
          expect(answers[0]?.observation).toBe('Local edits remain during network loss.')
        }
        await editor.getByRole('button', { name: 'Usar versión del servidor', exact: true }).click()
        if (origin === 'checklist') {
          await saveButton.click()
          await expect(saved).toBeVisible()
        } else {
          await expect(
            editor.getByRole('button', { name: 'Enviar registro', exact: true }),
          ).toBeEnabled()
        }
      }
      expect((await visit(request, data.id, renewed)).expiresAt).toBe(original)
      const otherContext = await browser.newContext({
        permissions: ['geolocation'],
        geolocation: { latitude: -12.1739, longitude: -77.0181, accuracy: 8 },
      })
      const another = await otherContext.newPage()
      await login(another)
      await another.goto(
        origin === 'checklist' ? data.path + data.id + '/start' : data.path + data.id,
      )
      await expect(another.locator('.nf-evidence img')).toHaveCount(1)
      expect((await visit(request, data.id, renewed)).expiresAt).toBe(original)
      await otherContext.close()
      advance(data.id, 'expire')
      await editor.reload()
      await expect(editor.getByRole('dialog', { name: 'Justificación por demora' })).toHaveCount(0)
      await expect(
        editor.getByRole('region', { name: 'Tiempo de registro del formulario' }),
      ).toHaveCount(0)
      await editor
        .getByRole('button', {
          name: origin === 'ticket' ? 'Enviar registro' : 'Finalizar',
          exact: true,
        })
        .click()
      await editor.getByRole('button', { name: 'Confirmar envío', exact: true }).click()
      await expect(editor.getByRole('dialog', { name: 'Trabajo finalizado' })).toBeVisible()
      const recorded = object(await call(request, `/visitas/${data.id}/`, renewed))
      expect(recorded.endLocation).toBeNull()
      expect(recorded.status).toBe('completed')
      expect(recorded.expiresAt).toBeNull()
      expect(recorded.registrationSeconds).toBeGreaterThan(300)
      await editor.close()
      const reviewer = await context.newPage()
      await login(reviewer, 'account')
      await reviewer.goto('/technical-supervisor/reports')
      await expect(reviewer.getByRole('heading', { name: 'Indicadores y reportes' })).toBeVisible()
      const downloading = reviewer.waitForEvent('download')
      await reviewer.getByRole('button', { name: 'Exportar CSV', exact: true }).click()
      expect((await downloading).suggestedFilename()).toMatch(/intervenciones-.*\.csv/)
    },
  )
}

for (const origin of ['checklist', 'ticket'] as const) {
  test(
    origin + ': excepción de llegada con foto, rechazo y corrección conservan eventos originales',
    async ({ page, context, request }) => {
      const data = await setup(request, origin)
      await login(page)
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'geolocation', {
          configurable: true,
          value: {
            getCurrentPosition(_ok: PositionCallback, error: PositionErrorCallback) {
              error({ code: 1 } as GeolocationPositionError)
            },
          },
        })
      })
      await arrivalException(page, data.id, origin)
      await openResults(page, origin)
      advance(data.id, 'expire')
      await page.reload()
      await expect(page.getByRole('dialog', { name: 'Justificación por demora' })).toHaveCount(0)
      const original = object(await call(request, `/visitas/${data.id}/`, data.token))
      const deadline = original.expiresAt
      expect((await visit(request, data.id, data.token)).status).toBe('in_progress')
      if (origin === 'checklist')
        await page.getByRole('button', { name: 'Conforme', exact: true }).click()
      else
        await page
          .getByLabel('Descripción del trabajo realizado')
          .fill('Repaired the installation and checked normal operation.')
      await upload(page)
      await page.getByRole('button', { name: 'Enviar a revisión', exact: true }).click()
      await page.getByRole('button', { name: 'Confirmar envío', exact: true }).click()
      await expect(
        page.getByRole('button', { name: 'Enviar a revisión', exact: true }),
      ).toHaveCount(0)
      const submitted = object(await call(request, '/visitas/' + data.id + '/', data.token))
      expect(submitted.workStatus).toBe('in_review')
      expect(submitted.expiresAt).toBe(deadline)
      const reviewer = await context.newPage()
      await login(reviewer, 'account')
      await reviewer.goto('/technical-supervisor/checklists/' + data.id)
      await reviewer.getByRole('button', { name: 'Rechazar', exact: true }).click()
      await reviewer
        .getByLabel('Motivo de rechazo')
        .fill('Please explain the connection interruption in more detail.')
      await reviewer.getByRole('button', { name: 'Confirmar decisión', exact: true }).click()
      await expect(reviewer.getByRole('dialog')).toHaveCount(0)
      await page.reload()
      await expect(
        page.getByRole('heading', { name: 'Corrección requerida', exact: true }),
      ).toBeVisible()
      expect(object(await call(request, `/visitas/${data.id}/`, data.token)).phase).toBe(
        'correction_required',
      )
      await expect(page.getByText('Justificación rechazada:', { exact: false })).toBeVisible()
      await expect(page.locator('.nf-evidence img')).toHaveCount(2)
      await page
        .getByLabel('Justificación GPS de llegada')
        .fill(
          'A mobile network interruption prevented sending the previously gathered photographs.',
        )
      if (origin === 'ticket')
        await page
          .getByLabel('Descripción del trabajo realizado')
          .fill('Repaired the installation, tested safety and confirmed stable operation.')
      else {
        await page.getByRole('button', { name: 'No conforme', exact: true }).click()
        await page
          .getByLabel('Descripción obligatoria')
          .fill('A damaged protective cover requires replacement.')
        await page.getByRole('button', { name: 'Guardar observación', exact: true }).click()
      }
      if (origin === 'checklist')
        await expect(page.getByText('Borrador guardado.', { exact: true })).toBeVisible()
      else
        await expect
          .poll(
            async () =>
              object(await call(request, `/visitas/${data.id}/`, data.token)).workDescription,
          )
          .toBe('Repaired the installation, tested safety and confirmed stable operation.')
      await page.getByRole('button', { name: 'Enviar a revisión', exact: true }).click()
      await page.getByRole('button', { name: 'Confirmar envío', exact: true }).click()
      await expect(
        page.getByRole('button', { name: 'Enviar a revisión', exact: true }),
      ).toHaveCount(0)
      expect((await visit(request, data.id, data.token)).expiresAt).toBe(deadline ?? undefined)
      await reviewer.reload()
      await reviewer.getByRole('button', { name: 'Aprobar', exact: true }).click()
      await reviewer
        .getByLabel('Motivo de aprobación')
        .fill('Verified corrected registration, GPS and the clarified network interruption.')
      await reviewer.getByRole('button', { name: 'Confirmar decisión', exact: true }).click()
      await expect(reviewer.getByRole('dialog')).toHaveCount(0)
      const completed = object(await call(request, '/visitas/' + data.id + '/', data.token))
      expect(completed.workStatus).toBe('finished')
      expect(completed.expiresAt).toBe(deadline)
      expect(object(completed.startLocation).validated).toBe(false)
      for (const key of ['startedAt', 'physicalEndedAt', 'formOpenedAt', 'startLocation'])
        expect(completed[key]).toEqual(original[key])
      if (!Array.isArray(completed.exceptionHistory))
        throw new Error('Sin historial de decisiones.')
      const history = completed.exceptionHistory
        .map(object)
        .filter((entry) => entry.kind === 'review')
      expect(history.map((entry) => object(entry.exception).approved)).toEqual([false, true])
      await page.reload()
      await expect(page.getByText('Esta visita ya fue finalizada.', { exact: true })).toBeVisible()
      await expect(page.getByText('Historial de excepciones', { exact: true })).toHaveCount(0)
      await expect(page.getByText('Detalles técnicos', { exact: true })).toHaveCount(0)
      await expect(
        page.getByText(
          'A mobile network interruption prevented sending the previously gathered photographs.',
          { exact: true },
        ),
      ).toHaveCount(1)
      await reviewer.reload()
      await reviewer.getByText('Historial de excepciones', { exact: true }).click()
      await expect(
        reviewer.getByRole('heading', { name: 'Historial de justificaciones y decisiones' }),
      ).toBeVisible()
      await expect(page.locator('.nf-evidence img')).toHaveCount(2)
      await reviewer.close()
    },
  )
}

test('IDs inválidos, roles y sesión sin rol fallan cerrado con API real', async ({ page }) => {
  await login(page)
  await page.goto('/routes/999999999')
  await expect(page.getByRole('alert')).toBeVisible()
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: 'Acceso denegado' })).toBeVisible()
  await page.evaluate(() => {
    const raw: unknown = JSON.parse(sessionStorage.getItem('nf:session:api:v1') ?? 'null')
    if (
      raw &&
      typeof raw === 'object' &&
      'user' in raw &&
      raw.user &&
      typeof raw.user === 'object'
    ) {
      sessionStorage.setItem(
        'nf:session:api:v1',
        JSON.stringify({ ...raw, user: { ...raw.user, role: null } }),
      )
    }
  })
  await page.goto('/checklists')
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible()
})
for (const username of ['tech', 'store', 'account', 'admin'])
  test('responsive y accesibilidad del portal real ' + username, async ({ page }) => {
    await login(page, username)
    for (const width of [320, 360, 390, 480, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    const menu = page.getByRole('dialog', { name: 'Menú de navegación' })
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeFocused()
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    await page.screenshot({
      path: 'test-results/portal-' + username + '-mobile.png',
      fullPage: true,
    })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({
      path: 'test-results/portal-' + username + '-desktop.png',
      fullPage: true,
    })
  })
test('mapa bajo demanda y fallo del proveedor conserva la lista real', async ({
  page,
  request,
}) => {
  const visitId = await scheduledMapVisit(request)
  const requests: string[] = []
  page.on('request', (request) => {
    if (/AssignedLocationsMap|tiles\.openfreemap\.org/.test(request.url()))
      requests.push(request.url())
  })
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort())
  await login(page)
  // Mis Checklist también carga el mapa general, incluidas las visitas finalizadas.
  await expect(page.getByRole('region', { name: 'Mapa de tiendas' })).toBeVisible()
  await page.goto('/routes')
  const detail = page.locator(`a[href="/routes/${visitId}"]`)
  await page.getByRole('button', { name: 'Pendientes', exact: true }).click()
  await expect(detail).toBeVisible()
  await expect.poll(() => requests.some((url) => url.includes('tiles.openfreemap.org'))).toBe(true)
  await expect(page.getByRole('button', { name: 'Reintentar mapa' })).toBeVisible({
    timeout: 20000,
  })
  expect(requests.some((url) => url.includes('AssignedLocationsMap'))).toBe(true)
  await expect(detail).toBeVisible()
  const tileRequests = () => requests.filter((url) => url.includes('tiles.openfreemap.org')).length
  const beforeRetry = tileRequests()
  await page.getByRole('button', { name: 'Reintentar mapa' }).click()
  await expect.poll(tileRequests).toBeGreaterThan(beforeRetry)
  await expect(page.getByRole('button', { name: 'Reintentar mapa' })).toBeVisible({
    timeout: 20000,
  })
  await expect(detail).toBeVisible()
  const visits = await call(request, '/visitas/programadas/', await access(request, 'tech'))
  if (!Array.isArray(visits)) throw new Error('Visitas incompatibles.')
  const completed = visits
    .map(mapVisit)
    .filter((visit) => visit.origin === 'ticket' && visit.status === 'completed')
  await page.getByRole('button', { name: 'Finalizadas', exact: true }).click()
  await expect(detail).toHaveCount(0)
  await expect(page.locator('#main-content .nf-list a')).toHaveCount(completed.length)
  if (completed.length)
    await expect(page.getByRole('link', { name: 'Ver detalle' }).first()).toBeVisible()
  else await expect(page.getByText('No tienes atenciones finalizadas por ahora.')).toBeVisible()
})
