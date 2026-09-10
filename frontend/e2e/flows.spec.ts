import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
async function login(page: Page, user = '1') {
  await page.goto('/login')
  await page.getByLabel('Cuenta de demostración').selectOption(user)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page.getByRole('button', { name: /Perfil de/ })).toBeVisible()
}
async function logout(page: Page) {
  await page.getByRole('button', { name: /Perfil de/ }).click()
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
}
async function photograph(page: Page) {
  await page.getByRole('button', { name: 'Tomar foto', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Tomar fotografía' })
  await dialog.getByRole('button', { name: 'Capturar', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirmar foto' }).click()
  await expect(dialog).not.toBeVisible()
}
async function checklist(page: Page, id = '1') {
  await page.goto(`/checklists/${id}`)
  await page.getByRole('button', { name: 'Iniciar checklist', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Finalizar checklist' })).toBeVisible()
  const conforms = page.getByRole('button', { name: '✓ Conforme', exact: true })
  for (let index = 0; index < (await conforms.count()); index++) await conforms.nth(index).click()
  for (let index = 0; index < 4; index++) await photograph(page)
  await expect(page.getByText('Borrador guardado.', { exact: true })).toBeVisible()
}
test('toma y completa checklist con cámara y ubicación de la segunda tienda', async ({ page }) => {
  await login(page)
  await checklist(page, '2')
  await page.getByRole('button', { name: 'Finalizar checklist' }).click()
  await expect(page.getByRole('dialog', { name: 'Trabajo completado' })).toBeVisible()
  await page.getByRole('button', { name: 'Volver al listado' }).click()
  await expect(page.getByRole('heading', { name: 'Mis Checklist', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Completadas', exact: true }).click()
  await expect(page.getByText('Completado', { exact: true })).toBeVisible()
})
test('registra incidencia, programa, reasigna y resuelve ticket entre portales', async ({
  page,
}) => {
  await login(page, '2')
  await page.goto('/supervisor/tickets/new')
  await page.getByLabel('Especialidad', { exact: true }).selectOption('Plomería')
  await page.getByLabel('Prioridad', { exact: true }).selectOption('Alta')
  await page.getByLabel('Descripción del problema').fill('Fuga en la válvula de agua de la tienda.')
  await page.getByRole('button', { name: 'Enviar reporte' }).click()
  await expect(page.getByRole('heading', { name: /Ticket #/ })).toBeVisible()
  const id = page.url().split('/').at(-1)!
  await logout(page)
  await login(page, '3')
  await page.goto(`/technical-supervisor/incidents/${id}`)
  await page.getByLabel('Técnico asignado', { exact: true }).selectOption('5')
  await page.getByRole('button', { name: 'Programar visita' }).click()
  await expect(page.getByRole('button', { name: 'Guardar reprogramación' })).toBeVisible()
  await page.getByLabel('Técnico asignado', { exact: true }).selectOption('1')
  await page
    .getByLabel('Motivo de reprogramación o reasignación')
    .fill('Cambio de disponibilidad del técnico.')
  await page.getByRole('button', { name: 'Guardar reprogramación' }).click()
  await expect(page.getByText(/Reprogramación \/ reasignación:/)).toBeVisible()
  await logout(page)
  await login(page)
  await page.goto('/routes')
  const card = page
    .locator('.nf-card')
    .filter({ has: page.getByText(`Ticket #${id}`, { exact: true }) })
  await card.getByRole('link', { name: 'Ver detalle' }).click()
  await page.getByRole('button', { name: 'Iniciar atención' }).click()
  await page
    .getByLabel('Descripción del trabajo realizado')
    .fill('Se sustituyó la válvula y se verificó la presión de agua.')
  await photograph(page)
  await page.getByRole('button', { name: 'Finalizar ticket' }).click()
  await expect(page.getByRole('dialog', { name: 'Trabajo completado' })).toBeVisible()
  await page.getByRole('button', { name: 'Volver al listado' }).click()
  await logout(page)
  await login(page, '2')
  await page.goto(`/supervisor/tickets/${id}`)
  await expect(page.getByText('Resuelto', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Resolución del técnico' })).toBeVisible()
})
test('IDs inválidos, roles y sesión sin rol fallan cerrado', async ({ page }) => {
  await login(page)
  await page.goto('/routes/999')
  await expect(page.getByRole('alert')).toContainText('Ticket no encontrado')
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: 'Acceso denegado' })).toBeVisible()
  await page.evaluate(() => {
    const raw = sessionStorage.getItem('nf:session:mock:v1')
    if (raw) {
      const session = JSON.parse(raw) as { user: { role: string | null } }
      session.user.role = null
      sessionStorage.setItem('nf:session:mock:v1', JSON.stringify(session))
    }
  })
  await page.goto('/checklists')
  await expect(page.getByRole('heading', { name: 'Sesión expirada' })).toBeVisible()
})
for (const user of ['1', '2', '3', '4'])
  test(`responsive y accesibilidad del portal ${user}`, async ({ page }) => {
    await login(page, user)
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
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(accessibility.violations).toEqual([])
    await page.screenshot({ path: `test-results/portal-${user}-mobile.png`, fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: `test-results/portal-${user}-desktop.png`, fullPage: true })
  })
test('administrador crea una plantilla con ítems y la conserva', async ({ page }) => {
  await login(page, '4')
  await page.goto('/admin/templates')
  await page.getByRole('button', { name: 'Crear registro' }).click()
  await page.getByLabel('Nombre de plantilla').fill('Inspección de prueba')
  await page.getByRole('button', { name: 'Agregar ítem' }).click()
  await page.getByLabel('Ítem 1', { exact: true }).fill('Revisar luminarias')
  await page.getByRole('button', { name: 'Revisar cambios' }).click()
  await page.getByRole('button', { name: 'Confirmar y guardar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(page.getByText(/Inspección de prueba/).first()).toBeVisible()
})

test('mapa se descarga bajo demanda y el fallo del proveedor conserva la lista', async ({
  page,
}) => {
  const mapRequests: string[] = []
  page.on('request', (request) => {
    if (/AssignedLocationsMap|tiles\.openfreemap\.org/.test(request.url()))
      mapRequests.push(request.url())
  })
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort())
  await login(page)
  await page.goto('/routes')
  await expect(page.getByRole('button', { name: 'Reintentar mapa' })).toBeVisible({
    timeout: 20000,
  })
  expect(mapRequests.some((url) => url.includes('AssignedLocationsMap'))).toBe(true)
  await expect(page.getByRole('link', { name: 'Ver detalle' }).first()).toBeVisible()
})
