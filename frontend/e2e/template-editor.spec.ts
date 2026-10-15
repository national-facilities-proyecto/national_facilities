import { expect, test } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { access, api, call, login, object } from './helpers.js'

for (const width of [320, 390, 1440]) {
  test(`plantilla ${width}px: editor completo, veinte ítems, salida protegida y edición persistente`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await login(page, 'admin')
    await page.goto('/admin/templates')
    await page.getByRole('button', { name: 'Crear registro', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/templates\/new$/)
    await expect(page.getByRole('heading', { name: 'Nueva plantilla', exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const name = 'E2E template editor ' + crypto.randomUUID().slice(0, 8)
    await page.getByLabel('Nombre de plantilla', { exact: true }).fill(name)
    await page.getByRole('button', { name: 'Revisar cambios', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Agrega al menos un ítem')
    for (let i = 1; i <= 20; i++) {
      await page.getByRole('button', { name: 'Agregar ítem', exact: true }).click()
      const input = page.getByLabel(`Ítem ${i}`, { exact: true })
      await expect(input).toBeFocused()
      await input.fill(`Revisión de componente ${i}`)
    }
    const actions = page.locator('.nf-template-actions')
    for (const position of ['top', 'middle', 'bottom']) {
      await page.evaluate((position) => {
        const height = document.documentElement.scrollHeight
        window.scrollTo(0, position === 'top' ? 0 : position === 'middle' ? height / 2 : height)
      }, position)
      const box = await actions.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.y).toBeGreaterThanOrEqual(0)
      expect(box!.y + box!.height).toBeLessThanOrEqual(845)
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.getByRole('link', { name: 'Volver a plantillas', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Cambios sin guardar' })).toBeVisible()
    await page.getByRole('button', { name: 'Seguir editando', exact: true }).click()
    await expect(page.getByLabel('Ítem 20', { exact: true })).toHaveValue(
      'Revisión de componente 20',
    )
    await page.goBack()
    await expect(page.getByRole('dialog', { name: 'Cambios sin guardar' })).toBeVisible()
    await page.getByRole('button', { name: 'Seguir editando', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/templates\/new$/)
    await page.getByLabel('Foto obligatoria del ítem 2', { exact: true }).uncheck()
    await page.getByLabel('Ítem 3 activo', { exact: true }).uncheck()
    await page.getByRole('button', { name: 'Subir ítem 20', exact: true }).click()
    await expect(page.getByLabel('Ítem 19', { exact: true })).toHaveValue(
      'Revisión de componente 20',
    )
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `test-results/template-editor-top-${width}.png` })
    await page.screenshot({ path: `test-results/template-editor-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Revisar cambios', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Revisión de la plantilla' })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(
      page.getByRole('list', { name: 'Ítems que se guardarán' }).getByRole('listitem'),
    ).toHaveCount(20)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByRole('button', { name: 'Revisar formulario', exact: true }).click()
    await expect(page.getByLabel('Ítem 19', { exact: true })).toHaveValue(
      'Revisión de componente 20',
    )
    await page.getByRole('button', { name: 'Revisar cambios', exact: true }).click()
    const saved = page.waitForResponse(
      (response) =>
        response.url() === api + '/admin/plantillas/' && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Confirmar y guardar', exact: true }).click()
    const result = object(await (await saved).json())
    if (typeof result.id !== 'number') throw new Error('La API no devolvió una plantilla.')
    if (!Array.isArray(result.tasks)) throw new Error('La API no devolvió los ítems creados.')
    const createdIds = result.tasks.map((task: unknown) => object(task).id)
    await expect(page).toHaveURL(/\/admin\/templates$/)
    const row =
      width < 1024
        ? page
            .getByRole('region', { name: 'Plantillas e ítems', exact: true })
            .getByRole('article')
            .filter({ hasText: name })
        : page
            .getByRole('table', { name: 'Plantillas e ítems', exact: true })
            .getByRole('row')
            .filter({ hasText: name })
    await row.getByRole('button', { name: 'Editar', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/templates/${result.id}/edit$`))
    await expect(page.getByRole('heading', { name: 'Editar plantilla', exact: true })).toBeVisible()
    await expect(page.getByLabel('Ítem 19', { exact: true })).toHaveValue(
      'Revisión de componente 20',
    )
    await expect(page.getByLabel('Foto obligatoria del ítem 2', { exact: true })).not.toBeChecked()
    await expect(page.getByLabel('Ítem 3 activo', { exact: true })).not.toBeChecked()
    await page.getByLabel('Nombre de plantilla', { exact: true }).fill(name + ' editada')
    await page.getByRole('button', { name: 'Revisar cambios', exact: true }).click()
    await page.getByRole('button', { name: 'Confirmar y guardar', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/templates$/)
    const token = await access(request, 'admin')
    const templates = await call(request, '/admin/plantillas/', token)
    if (!Array.isArray(templates)) throw new Error('Catálogo incompatible.')
    const persisted = templates.map(object).find((template) => template.id === result.id)
    expect(persisted?.name).toBe(name + ' editada')
    if (!Array.isArray(persisted?.tasks)) throw new Error('Ítems no recuperados.')
    const tasks = persisted.tasks.map(object)
    expect(tasks).toHaveLength(20)
    expect(tasks.map((task) => task.id)).toEqual(createdIds)
    expect(tasks[18].title).toBe('Revisión de componente 20')
    expect(tasks[1].photoRequired).toBe(false)
    expect(tasks[2].active).toBe(false)
    expect(tasks.map((task) => task.order)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    await page.goto(`/admin/templates/${result.id}/edit`)
    await page.getByLabel('Nombre de plantilla', { exact: true }).fill('Cambio descartado')
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await page.getByRole('button', { name: 'Salir sin guardar', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/templates$/)
    await page.goto(`/admin/templates/${result.id}/edit`)
    await expect(page.getByLabel('Nombre de plantilla', { exact: true })).toHaveValue(
      name + ' editada',
    )
  })
}

test('editor: acceso exclusivo de administrador y plantilla inexistente', async ({ page }) => {
  for (const username of ['tech', 'store', 'account']) {
    await page.goto('/login')
    await page.evaluate(() => sessionStorage.clear())
    await login(page, username)
    for (const path of ['/admin/templates/new', '/admin/templates/1/edit']) {
      await page.goto(path)
      await expect(
        page.getByRole('heading', { name: 'Acceso denegado', exact: true }),
      ).toBeVisible()
      await expect(page.getByLabel('Nombre de plantilla', { exact: true })).toHaveCount(0)
    }
  }
  await page.evaluate(() => sessionStorage.clear())
  await login(page, 'admin')
  await page.goto('/admin/templates/999999999/edit')
  await expect(page.getByRole('alert')).toContainText('Plantilla no encontrada.')
  await page.getByRole('link', { name: 'Volver a plantillas', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/templates$/)
})
