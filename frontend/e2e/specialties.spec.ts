import { expect, test } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { access, call, login, object } from './helpers.js'

for (const width of [320, 1440]) {
  test(`especialidades: catálogo, habilitación por cliente y disponibilidad en supervisor (${width})`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const token = await access(request, 'admin')
    const clients = await call(request, '/admin/clientes/', token)
    if (!Array.isArray(clients) || !clients.length) throw new Error('Faltan clientes de prueba')
    const clientId = String(object(clients[0]).id)
    const name = `Especialidad UX ${width} ${Date.now()}`
    await login(page, 'admin')
    await page.goto('/admin/specialties')
    await expect(page.getByLabel('Cliente', { exact: true })).toHaveValue('')
    await page.getByRole('button', { name: 'Catálogo de especialidades', exact: true }).click()
    await page.getByRole('button', { name: 'Nueva especialidad', exact: true }).click()
    await page.getByLabel('Nombre de especialidad', { exact: true }).fill(name)
    await page.getByRole('button', { name: 'Guardar especialidad', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Por cliente', exact: true }).click()
    await page.getByLabel('Cliente', { exact: true }).selectOption(clientId)
    await expect(page.getByRole('checkbox', { name, exact: true })).not.toBeChecked()
    await page.getByRole('checkbox', { name, exact: true }).check()
    await page.getByRole('button', { name: 'Catálogo de especialidades', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Cambios sin guardar' })).toBeVisible()
    await page.getByRole('button', { name: 'Seguir editando', exact: true }).click()
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await expect(page.getByText(/Se actualizaron las especialidades/)).toBeVisible()
    await page.reload()
    await page.getByLabel('Cliente', { exact: true }).selectOption(clientId)
    await expect(page.getByRole('checkbox', { name, exact: true })).toBeChecked()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/specialties-client-${width}.png`, fullPage: true })
    const storeToken = await access(request, 'store')
    const catalogs = object(await call(request, '/catalogos/', storeToken))
    expect((catalogs.categories as unknown[]).map((row) => object(row).name)).toContain(name)
    await page.getByRole('checkbox', { name, exact: true }).uncheck()
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await expect(page.getByText(/Se actualizaron las especialidades/)).toBeVisible()
    const updated = object(await call(request, '/catalogos/', storeToken))
    expect((updated.categories as unknown[]).map((row) => object(row).name)).not.toContain(name)
    await page.getByRole('button', { name: 'Catálogo de especialidades', exact: true }).click()
    await page.getByRole('button', { name: `Editar ${name}`, exact: true }).click()
    await page.getByLabel('Especialidad activa', { exact: true }).uncheck()
    await expect(page.getByRole('dialog')).toContainText('ningún cliente')
    await page.getByRole('button', { name: 'Guardar especialidad', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/specialties-catalog-${width}.png`, fullPage: true })
  })
}
