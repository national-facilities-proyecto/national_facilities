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
} from './helpers.js'
import type { APIRequestContext, Page } from '@playwright/test'

async function setup(request: APIRequestContext, origin: 'checklist' | 'ticket') {
  const token = await access(request, 'tech')
  if (origin === 'checklist') return { id: checklistCase(), token, path: '/checklists/' }
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
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      priorityId: object(catalogs.priorities[0]).id,
      reason: '',
      revision: 0,
    }),
  )
  if (typeof scheduled.visitId !== 'number') throw new Error('Sin visita.')
  return { id: scheduled.visitId, token, path: '/routes/' }
}
async function start(page: Page, id: number, path: string) {
  await page.goto(path + id)
  await page.getByRole('button', { name: 'Obtener ubicación', exact: true }).click()
  await page.getByRole('button', { name: path === '/checklists/' ? 'Iniciar checklist' : 'Confirmar inicio', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Trabajo en ejecución' })).toBeVisible()
}
async function form(page: Page, origin: 'checklist' | 'ticket') {
  await page
    .getByRole('button', {
      name: origin === 'checklist' ? 'Finalizar checklist' : 'Registrar resolución',
      exact: true,
    })
    .click()
  if (origin === 'checklist')
    await page.getByRole('button', { name: '✓ Conforme', exact: true }).click()
  else
    await page
      .getByLabel('Descripción del trabajo realizado')
      .fill('Completed repair and checked device operation.')
  await upload(page)
}

for (const origin of ['checklist', 'ticket'] as const) {
  test(
    origin + ': cierre de pestaña, conexión perdida, sesión expirada y justificación tras vencer',
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
      await expect(editor.getByRole('heading', { name: 'Trabajo en ejecución' })).toBeVisible()
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
        await editor.getByRole('button', { name: '! No conforme', exact: true }).click()
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
      await editor.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
      await expect(editor.getByText('Borrador guardado.', { exact: true })).toBeVisible()
      const revoked = await request.post(api + '/auth/logout/', {
        headers: { Authorization: 'Bearer ' + data.token },
      })
      expect(revoked.status()).toBe(204)
      await editor.getByRole('button', { name: 'Finalizar ' + origin, exact: true }).click()
      await expect(editor.getByRole('dialog', { name: 'Recuperar sesión' })).toBeVisible()
      await editor.getByLabel('Contraseña para recuperar sesión').fill(password)
      await editor.getByRole('button', { name: 'Autenticar y continuar' }).click()
      await expect(editor.getByRole('dialog', { name: 'Recuperar sesión' })).not.toBeVisible()
      await editor.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
      await expect(editor.getByText('Borrador guardado.', { exact: true })).toBeVisible()
      const renewed = await access(request, 'tech')
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
      await expect(editor.getByRole('dialog', { name: 'Justificación por demora' })).toBeVisible()
      const expired = (await visit(request, data.id, renewed)).expiresAt
      await editor
        .getByLabel('Justificación obligatoria')
        .fill('Recovered after device power loss and session expiration.')
      await editor.getByRole('button', { name: 'Enviar para revisión', exact: true }).click()
      await expect(editor.getByRole('heading', { name: 'En revisión' })).toBeVisible()
      if (origin === 'ticket') {
        await editor.getByRole('button', { name: 'Registrar GPS de cierre', exact: true }).click()
      } else {
        const recorded = object(await call(request, `/visitas/${data.id}/`, renewed))
        expect(object(recorded.endLocation).validated).toBe(true)
      }
      await expect(
        editor.getByRole('button', { name: 'Registrar GPS de cierre', exact: true }),
      ).not.toBeVisible()
      expect((await visit(request, data.id, renewed)).status).toBe('pending_approval')
      await editor.close()
      const reviewer = await context.newPage()
      await login(reviewer, 'account')
      await reviewer.goto('/technical-supervisor/checklists/' + data.id)
      await reviewer.getByRole('button', { name: 'Aprobar excepción', exact: true }).click()
      await reviewer
        .getByLabel('Motivo de aprobación')
        .fill('Verified complete content, evidence and timing justification.')
      await reviewer.getByRole('button', { name: 'Confirmar decisión', exact: true }).click()
      await expect(reviewer.getByRole('dialog')).toHaveCount(0)
      expect((await visit(request, data.id, renewed)).status).toBe('completed')
      expect((await visit(request, data.id, renewed)).expiresAt).toBe(expired)
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
    origin +
      ': completar tras vencer, rechazo, corrección y aprobación conservan ejecución y plazo',
    async ({ page, context, request }) => {
      const data = await setup(request, origin)
      await login(page)
      await start(page, data.id, data.path)
      await page
        .getByRole('button', {
          name: origin === 'checklist' ? 'Finalizar checklist' : 'Registrar resolución',
          exact: true,
        })
        .click()
      advance(data.id, 'expire')
      await page.reload()
      await expect(page.getByRole('dialog', { name: 'Justificación por demora' })).toBeVisible()
      const deadline = (await visit(request, data.id, data.token)).expiresAt
      await page
        .getByLabel('Justificación obligatoria')
        .fill('Connection failed while uploading the evidence photographs.')
      await page
        .getByRole('button', { name: 'Guardar justificación y continuar', exact: true })
        .click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'En revisión', exact: true })).toBeVisible()
      if (origin === 'checklist')
        await page.getByRole('button', { name: '✓ Conforme', exact: true }).click()
      else
        await page
          .getByLabel('Descripción del trabajo realizado')
          .fill('Repaired the installation and checked normal operation.')
      await upload(page)
      await page.getByRole('button', { name: 'Enviar para revisión', exact: true }).click()
      await page.getByRole('button', { name: 'Confirmar finalización', exact: true }).click()
      await expect(
        page.getByRole('button', { name: 'Enviar para revisión', exact: true }),
      ).toHaveCount(0)
      const submitted = object(await call(request, '/visitas/' + data.id + '/', data.token))
      expect(submitted.workStatus).toBe('in_review')
      expect(submitted.expiresAt).toBe(deadline)
      const reviewer = await context.newPage()
      await login(reviewer, 'account')
      await reviewer.goto('/technical-supervisor/checklists/' + data.id)
      await reviewer.getByRole('button', { name: 'Rechazar excepción', exact: true }).click()
      await reviewer
        .getByLabel('Motivo de rechazo')
        .fill('Please explain the connection interruption in more detail.')
      await reviewer.getByRole('button', { name: 'Confirmar decisión', exact: true }).click()
      await expect(reviewer.getByRole('dialog')).toHaveCount(0)
      await page.reload()
      await expect(page.getByText('Justificación rechazada:', { exact: false })).toBeVisible()
      await expect(page.locator('.nf-evidence img')).toHaveCount(1)
      await page
        .getByLabel('Justificación de la demora')
        .fill(
          'A mobile network interruption prevented sending the previously gathered photographs.',
        )
      if (origin === 'ticket')
        await page
          .getByLabel('Descripción del trabajo realizado')
          .fill('Repaired the installation, tested safety and confirmed stable operation.')
      else {
        await page.getByRole('button', { name: '! No conforme', exact: true }).click()
        await page
          .getByLabel('Descripción obligatoria')
          .fill('A damaged protective cover requires replacement.')
        await page.getByRole('button', { name: 'Guardar observación', exact: true }).click()
      }
      await expect(page.getByText('Borrador guardado.', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Enviar para revisión', exact: true }).click()
      await page.getByRole('button', { name: 'Confirmar finalización', exact: true }).click()
      await expect(
        page.getByRole('button', { name: 'Enviar para revisión', exact: true }),
      ).toHaveCount(0)
      expect((await visit(request, data.id, data.token)).expiresAt).toBe(deadline)
      await reviewer.reload()
      await reviewer.getByRole('button', { name: 'Aprobar excepción', exact: true }).click()
      await reviewer
        .getByLabel('Motivo de aprobación')
        .fill('Verified corrected registration, GPS and the clarified network interruption.')
      await reviewer.getByRole('button', { name: 'Confirmar decisión', exact: true }).click()
      await expect(reviewer.getByRole('dialog')).toHaveCount(0)
      const completed = object(await call(request, '/visitas/' + data.id + '/', data.token))
      expect(completed.workStatus).toBe('finished')
      expect(completed.expiresAt).toBe(deadline)
      if (!Array.isArray(completed.exceptionHistory))
        throw new Error('Sin historial de decisiones.')
      const history = completed.exceptionHistory
        .map(object)
        .filter((entry) => entry.kind === 'review')
      expect(history.map((entry) => object(entry.exception).approved)).toEqual([false, true])
      await page.reload()
      await expect(page.getByText('Esta visita ya fue finalizada.', { exact: true })).toBeVisible()
      await expect(
        page.getByRole('heading', { name: 'Historial de justificaciones y decisiones' }),
      ).toBeVisible()
      await expect(page.locator('.nf-evidence img')).toHaveCount(1)
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
test('mapa bajo demanda y fallo del proveedor conserva la lista real', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => {
    if (/AssignedLocationsMap|tiles\.openfreemap\.org/.test(request.url()))
      requests.push(request.url())
  })
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort())
  await login(page)
  await page.goto('/routes')
  await expect(page.getByRole('button', { name: 'Reintentar mapa' })).toBeVisible({
    timeout: 20000,
  })
  expect(requests.some((url) => url.includes('AssignedLocationsMap'))).toBe(true)
  await page.getByRole('button', { name: 'Finalizados', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Ver detalle' }).first()).toBeVisible()
})
