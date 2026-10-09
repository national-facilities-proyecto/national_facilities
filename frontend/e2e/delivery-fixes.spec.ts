import { expect, test } from '@playwright/test'
import { access, api, call, checklistCase, jpeg, login, object, password } from './helpers.js'

let menuChecklistId: number
let menuTicketId: number
let menuVisitId: number
let menuReviewId: number

test.beforeAll(async ({ request }) => {
  menuChecklistId = checklistCase()
  const tech = await access(request, 'tech')
  const store = await access(request, 'store')
  const raw = await call(request, '/tiendas/', store)
  const catalogs = object(await call(request, '/catalogos/', store))
  if (
    !Array.isArray(raw) ||
    !Array.isArray(catalogs.categories) ||
    !Array.isArray(catalogs.priorities)
  )
    throw new Error('Catálogo incompatible.')
  const ticket = object(
    await call(request, '/tickets/', store, {
      storeId: object(raw[0]).id,
      categoryId: object(catalogs.categories[0]).id,
      priorityId: object(catalogs.priorities[0]).id,
      description: 'Incidencia aislada para comprobar navegación en detalles.',
      evidenceIds: [],
    }),
  )
  menuTicketId = Number(ticket.id)
  const account = await access(request, 'account')
  const users = await call(request, '/usuarios/', account)
  if (!Array.isArray(users)) throw new Error('Listado incompatible.')
  const scheduled = object(
    await call(request, `/tickets/${menuTicketId}/programar/`, account, {
      technicianId: users.map(object).find((user) => user.username === 'tech')?.id,
      scheduledAt: new Date().toISOString(),
      priorityId: object(catalogs.priorities[0]).id,
      reason: '',
      revision: 0,
    }),
  )
  menuVisitId = Number(scheduled.visitId)
  // La lista vacía no reproduce el desbordamiento de Revisiones pendientes.
  // Este caso con foto no depende de registros creados por otros tests.
  menuReviewId = checklistCase()
  const reviewPath = `/visitas/${menuReviewId}`
  await call(request, `/visitas/pool/${menuReviewId}/tomar/`, tech, {})
  const upload = await request.post(api + '/evidencias/', {
    headers: { Authorization: 'Bearer ' + tech },
    multipart: {
      id: crypto.randomUUID(),
      foto: { name: 'menu-arrival.jpg', mimeType: 'image/jpeg', buffer: jpeg },
      visitId: String(menuReviewId),
      source: 'camera',
      purpose: 'arrival',
      capturedAt: new Date().toISOString(),
    },
  })
  expect(upload.ok(), await upload.text()).toBe(true)
  const photo = object(await upload.json())
  await call(request, reviewPath + '/excepciones/', tech, {
    type: 'location',
    scope: 'arrival',
    failure: 'unavailable',
    reason: 'Fotografía de llegada para comprobar el menú con una revisión pendiente.',
    evidenceId: photo.id,
  })
  await call(request, reviewPath + '/terminar/', tech, {})
  const opened = object(await call(request, reviewPath + '/formulario/', tech, {}))
  if (!Array.isArray(opened.tasks)) throw new Error('Tareas incompatibles.')
  const draft = object(
    await call(request, reviewPath + '/borrador/', tech, {
      revision: opened.revision,
      answers: opened.tasks.map((task) => ({
        taskId: object(task).id,
        result: 'no_aplica',
        observation: 'Equipo no instalado en este caso aislado.',
        evidenceIds: [],
      })),
      workDescription: '',
      evidenceIds: [],
    }),
  )
  await call(request, reviewPath + '/enviar-revision/', tech, { revision: draft.revision })
  await call(request, `/visitas/pool/${menuChecklistId}/tomar/`, tech, {})
  const visit = object(await call(request, `/visitas/${menuChecklistId}/`, tech))
  const snapshot = object(visit.storeSnapshot)
  await call(request, `/visitas/${menuChecklistId}/iniciar/`, tech, {
    location: {
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      accuracy: 8,
      capturedAt: Date.now(),
    },
  })
})

test.afterAll(async ({ request }) => {
  if (menuChecklistId) {
    const tech = await access(request, 'tech')
    const current = object(await call(request, `/visitas/${menuChecklistId}/`, tech))
    if (current.status === 'in_progress')
      await call(request, `/visitas/${menuChecklistId}/no-realizada/`, tech, {
        reason: 'Fin de comprobación aislada del menú; se conserva el historial.',
      })
  }
})

test.describe('Menú táctil Android', () => {
  test.use({ isMobile: true, hasTouch: true })
  for (const [username, path, link, target] of [
    ['tech', '/checklists', 'Atenciones', '/routes'],
    ['store', '/supervisor/tickets', 'Registrar incidencia', '/supervisor/tickets/new'],
    ['account', '/technical-supervisor/reviews', 'Checklists', '/technical-supervisor/checklists'],
    ['admin', '/admin/users', 'Tiendas', '/admin/stores'],
  ]) {
    test(`menú móvil completo, cierre y navegación: ${username}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await login(page, username)
      await page.goto(path)
      await expect(page.locator('main h1')).toBeVisible()
      await expect(page.locator('main .nf-loading:not(.nf-loading--map)')).toHaveCount(0)
      const trigger = page.getByRole('button', { name: 'Abrir menú', exact: true })
      for (const size of [
        { width: 320, height: 640 },
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
        await page.setViewportSize(size)
        await trigger.click()
        const menu = page.getByRole('dialog', { name: 'Menú de navegación' })
        await expect(menu).toBeVisible()
        const bounds = await menu.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.y).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
        ).toBe(true)
        if (size.width === 390) await page.screenshot({ path: `test-results/menu-${username}.png` })
        await menu.getByRole('button', { name: 'Cerrar Menú de navegación' }).click()
        await expect(menu).toHaveCount(0)
        await expect(trigger).toBeFocused()
      }
      await trigger.click()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await trigger.click()
      await page
        .getByRole('navigation', { name: 'Navegación móvil' })
        .getByRole('link', { name: link, exact: true })
        .click()
      await expect(page).toHaveURL(target)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      const pages: Record<string, string[]> = {
        tech: [
          '/checklists',
          `/checklists/${menuChecklistId}`,
          `/checklists/${menuChecklistId}/start`,
          '/routes',
          `/routes/${menuVisitId}`,
        ],
        store: [
          '/supervisor/tickets',
          '/supervisor/tickets/new',
          `/supervisor/tickets/${menuTicketId}`,
        ],
        account: [
          '/technical-supervisor/visits',
          '/technical-supervisor/reports',
          '/technical-supervisor/incidents/completed',
          `/technical-supervisor/incidents/${menuTicketId}`,
          '/technical-supervisor/checklists',
          '/technical-supervisor/reviews',
          `/technical-supervisor/checklists/${menuReviewId}`,
        ],
        admin: [
          'users',
          'clients',
          'stores',
          'zones',
          'contracts',
          'templates',
          'specialties',
          'clientSpecialties',
        ].map((kind) => '/admin/' + kind),
      }
      await page.setViewportSize({ width: 390, height: 844 })
      for (const route of [...pages[username], '/profile/password']) {
        await page.goto(route)
        await expect(page.locator('main h1')).toBeVisible()
        await expect(page.locator('main .nf-loading:not(.nf-loading--map)')).toHaveCount(0)
        await expect(page.locator('main h1')).not.toHaveText(/Cargando|404/)
        await trigger.click()
        const menu = page.getByRole('dialog', { name: 'Menú de navegación' })
        await expect(menu).toBeVisible()
        const bounds = await menu.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
        ).toBe(true)
        await menu.getByRole('button', { name: 'Cerrar Menú de navegación' }).click()
        await expect(trigger).toBeFocused()
      }
      await page.setViewportSize({ width: 1440, height: 900 })
      await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
    })
  }
})

test('primer acceso: rechaza contraseña inicial repetida y acepta una diferente', async ({
  page,
  request,
}) => {
  const token = await access(request, 'admin')
  const username = 'first-login-' + crypto.randomUUID().slice(0, 8)
  await call(request, '/admin/usuarios/', token, {
    username,
    name: 'Prueba aislada primer acceso',
    role: 'administrator',
    active: true,
    password,
    storeIds: [],
    coverages: [],
  })
  await login(page, username)
  await expect(page.getByRole('heading', { name: 'Cambiar contraseña', exact: true })).toBeVisible()
  await page.getByLabel('Nueva contraseña', { exact: true }).fill(password)
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click()
  await expect(page.getByLabel('Nueva contraseña', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await expect(
    page
      .getByText('La nueva contraseña debe ser diferente de la contraseña actual.', {
        exact: true,
      })
      .first(),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cambiar contraseña', exact: true })).toBeVisible()
  const changed = 'A-different-secure-2026!'
  await page.getByLabel('Nueva contraseña', { exact: true }).fill(changed)
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill(changed)
  await page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click()
  await expect(page).toHaveURL('/admin/users')
  const oldLogin = await request.post(api + '/auth/login/', { data: { username, password } })
  expect(oldLogin.status()).toBe(401)
  const newLogin = await request.post(api + '/auth/login/', {
    data: { username, password: changed },
  })
  expect(newLogin.ok()).toBe(true)
})

test('administración: errores claros de usuario con espacios y tienda ocupada conservan el formulario', async ({
  page,
  request,
}) => {
  const token = await access(request, 'store')
  const raw = await call(request, '/tiendas/', token)
  if (!Array.isArray(raw)) throw new Error('Listado incompatible.')
  const storeId = object(raw[0]).id
  await login(page, 'admin')
  await page.goto('/admin/users')
  await page.getByRole('button', { name: 'Crear registro', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const username = 'mass-' + crypto.randomUUID().slice(0, 8)
  await dialog.getByLabel('Usuario de acceso', { exact: true }).fill(username + ' espacio')
  await dialog.getByLabel('Nombre completo', { exact: true }).fill('Supervisor aislado')
  await dialog
    .getByLabel('Contraseña inicial (obligatoria al crear)', { exact: true })
    .fill(password)
  await dialog.getByLabel('Rol', { exact: true }).selectOption('store_supervisor')
  await dialog.getByLabel('Tienda asignada', { exact: true }).selectOption(String(storeId))
  await dialog.getByRole('button', { name: 'Revisar cambios', exact: true }).click()
  await expect(dialog.getByLabel('Usuario de acceso', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await expect(
    dialog.getByText('El nombre de usuario no puede contener espacios.', { exact: true }).first(),
  ).toBeVisible()
  await dialog.getByLabel('Usuario de acceso', { exact: true }).fill(username)
  await dialog.getByRole('button', { name: 'Revisar cambios', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirmar y guardar', exact: true }).click()
  await expect(dialog.getByLabel('Tienda asignada', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await expect(
    dialog
      .getByText('La tienda ya está asignada a un supervisor de tienda activo.', { exact: true })
      .first(),
  ).toBeVisible()
  await expect(dialog.getByLabel('Usuario de acceso', { exact: true })).toHaveValue(username)
  const users = await call(request, '/admin/usuarios/', await access(request, 'admin'))
  if (!Array.isArray(users)) throw new Error('Listado incompatible.')
  expect(users.map(object).some((user) => user.username === username)).toBe(false)
})

test('mapa: posición identificada y visible junto a las tiendas aunque esté lejos', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await context.setGeolocation({ latitude: -12.3, longitude: -77.2, accuracy: 8 })
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-protobuf',
      body: Buffer.alloc(0),
    }),
  )
  await login(page)
  await expect(page.locator('.nf-map-status')).toHaveCount(0)
  await page.getByRole('button', { name: 'Mi ubicación', exact: true }).click()
  const marker = page.getByRole('button', { name: 'Tu ubicación', exact: true })
  await expect(marker).toBeVisible()
  await expect(marker).toHaveClass(/nf-marker--position/)
  await expect(page.locator('.leaflet-tooltip').filter({ hasText: 'Tu ubicación' })).toBeVisible()
  await expect
    .poll(async () => {
      const bounds = await marker.boundingBox()
      const map = await page.locator('.nf-map-container').boundingBox()
      return (
        !!bounds &&
        !!map &&
        bounds.x >= map.x &&
        bounds.x + bounds.width <= map.x + map.width &&
        bounds.y >= map.y &&
        bounds.y + bounds.height <= map.y + map.height
      )
    })
    .toBe(true)
  const colors = await page.evaluate(() => ({
    position: getComputedStyle(document.querySelector('.nf-marker--position span')!)
      .backgroundColor,
    store: getComputedStyle(document.querySelector('.nf-marker:not(.nf-marker--position) span')!)
      .backgroundColor,
  }))
  expect(colors.position).not.toBe(colors.store)
  await page.locator('.nf-map').screenshot({ path: 'test-results/position-map.png' })
})

test('administración: ocho secciones y formularios visibles en escritorio y móvil', async ({
  page,
}) => {
  await login(page, 'admin')
  for (const kind of [
    'users',
    'clients',
    'stores',
    'zones',
    'contracts',
    'templates',
    'specialties',
    'clientSpecialties',
  ]) {
    await page.goto('/admin/' + kind)
    await expect(page.getByRole('button', { name: 'Crear registro', exact: true })).toBeVisible()
    for (const size of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size)
      await page.getByRole('button', { name: 'Crear registro', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      const bounds = await dialog.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true)
      await dialog
        .getByRole('button', { name: 'Revisar cambios', exact: true })
        .scrollIntoViewIfNeeded()
      await expect(
        dialog.getByRole('button', { name: 'Revisar cambios', exact: true }),
      ).toBeVisible()
      await page.keyboard.press('Escape')
    }
  }
})

test('administración: filtros por nombre, rol y estado devuelven los usuarios correspondientes', async ({
  page,
}) => {
  await login(page, 'admin')
  const rows = page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: 'Editar', exact: true }) })
  await page.getByLabel('Buscar por nombre', { exact: true }).fill('othertech')
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('othertech')
  await page.getByLabel('Rol', { exact: true }).selectOption('store_supervisor')
  await expect(rows).toHaveCount(0)
  await page.getByLabel('Rol', { exact: true }).selectOption('technician')
  await page.getByLabel('Estado', { exact: true }).selectOption('true')
  await expect(rows).toHaveCount(1)
  await page.getByLabel('Estado', { exact: true }).selectOption('false')
  await expect(rows).toHaveCount(0)
})
