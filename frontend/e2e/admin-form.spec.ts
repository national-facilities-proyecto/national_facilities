import { expect, test } from '@playwright/test'
import { access, call, login, object } from './helpers.js'

test('cliente: conserva el formulario ante tiempo/foco y persiste razón social', async ({
  page,
  request,
}) => {
  await login(page, 'admin')
  await page.goto('/admin/clients')
  await page.getByRole('button', { name: 'Crear registro', exact: true }).click()
  const legal = 'E2E legal company ' + crypto.randomUUID()
  const taxId = 'LEGAL-' + crypto.randomUUID().slice(0, 12)
  await page.getByLabel('Razón social', { exact: true }).fill(legal)
  await page.getByLabel('RUC / identificación', { exact: true }).fill(taxId)
  await page.getByLabel('Correo de contacto', { exact: true }).fill('legal@test.invalid')
  await expect(page.getByRole('dialog').locator('input')).toHaveCount(3)
  await page.clock.install()
  await page.clock.runFor(31000)
  await page.evaluate(() => {
    for (const event of ['focus', 'online', 'nf:data']) window.dispatchEvent(new Event(event))
  })
  await expect(page.getByRole('dialog', { name: 'Crear · Clientes' })).toBeVisible()
  await expect(page.getByLabel('Razón social', { exact: true })).toHaveValue(legal)
  await expect(page.getByLabel('RUC / identificación', { exact: true })).toHaveValue(taxId)
  await expect(page.getByLabel('Correo de contacto', { exact: true })).toHaveValue(
    'legal@test.invalid',
  )
  await page.getByRole('button', { name: 'Revisar cambios', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar y guardar', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: legal })
  await expect(row).toContainText(taxId)
  const token = await access(request, 'admin')
  const raw = await call(request, '/admin/clientes/', token)
  if (!Array.isArray(raw)) throw new Error('Listado de clientes incompatible.')
  const saved = raw.map(object).find((client) => client.taxId === taxId)
  expect(saved?.name).toBe(legal)
  expect(saved).toEqual({ id: expect.any(Number), name: legal, taxId, email: 'legal@test.invalid' })
  await page.reload()
  await row.getByRole('button', { name: 'Editar', exact: true }).click()
  await expect(page.getByLabel('Razón social', { exact: true })).toHaveValue(legal)
  await expect(page.getByLabel('RUC / identificación', { exact: true })).toHaveValue(taxId)
  await expect(page.getByLabel('Correo de contacto', { exact: true })).toHaveValue(
    'legal@test.invalid',
  )
})

test('tienda: pega coordenadas de un mapa, valida rangos y guarda la ubicación con seis decimales', async ({
  page,
  request,
}) => {
  const token = await access(request, 'admin')
  const suffix = crypto.randomUUID().slice(0, 8)
  const client = object(
    await call(request, '/admin/clientes/', token, {
      name: 'E2E coordinates client ' + suffix,
      taxId: 'COORD-' + suffix,
      email: 'coordinates@test.invalid',
    }),
  )
  await login(page, 'admin')
  await page.goto('/admin/stores')
  await page.getByRole('button', { name: 'Crear registro', exact: true }).click()
  const storeName = 'E2E coordinates store ' + suffix
  await page.getByLabel('Nombre de tienda', { exact: true }).fill(storeName)
  await page.getByLabel('Dirección', { exact: true }).fill('Isolated coordinate test address')
  await page.getByLabel('Contacto', { exact: true }).fill('Test contact')
  await page.getByLabel('Cliente', { exact: true }).selectOption(String(client.id))
  await page.getByLabel('Latitud', { exact: true }).fill('90.0000001')
  await page.getByLabel('Longitud', { exact: true }).fill('-76.9889393558228')
  await page.getByRole('button', { name: 'Revisar cambios', exact: true }).click()
  await expect(page.getByLabel('Latitud', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByLabel('Nombre de tienda', { exact: true })).toHaveValue(storeName)
  await page.getByLabel('Latitud', { exact: true }).fill('-12.127876278416577')
  await page.getByLabel('Longitud', { exact: true }).fill('-180.0000001')
  await page.getByRole('button', { name: 'Revisar cambios', exact: true }).click()
  await expect(page.getByLabel('Longitud', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await page.getByLabel('Longitud', { exact: true }).evaluate((input) => {
    const data = new DataTransfer()
    data.setData('text', '-12.127876278416577, -76.9889393558228')
    input.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    )
  })
  await expect(page.getByLabel('Latitud', { exact: true })).toHaveValue('-12.127876278416577')
  await expect(page.getByLabel('Longitud', { exact: true })).toHaveValue('-76.9889393558228')
  await page.getByRole('button', { name: 'Revisar cambios', exact: true }).click()
  await expect(page.getByText('Ubicación que se guardará:', { exact: false })).toContainText(
    'latitud -12.127876, longitud -76.988939',
  )
  await page.getByRole('button', { name: 'Confirmar y guardar', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: storeName })
  await expect(row).toBeVisible()
  const raw = await call(request, '/admin/tiendas/', token)
  if (!Array.isArray(raw)) throw new Error('Listado de tiendas incompatible.')
  const saved = raw.map(object).find((store) => store.name === storeName)
  expect(saved?.latitude).toBe('-12.127876')
  expect(saved?.longitude).toBe('-76.988939')
  await page.reload()
  await row.getByRole('button', { name: 'Editar', exact: true }).click()
  await expect(page.getByLabel('Latitud', { exact: true })).toHaveValue('-12.127876')
  await expect(page.getByLabel('Longitud', { exact: true })).toHaveValue('-76.988939')
  await page.getByLabel('Latitud', { exact: true }).fill('-12,127876278416577')
  await page.getByLabel('Longitud', { exact: true }).fill('-76,9889393558228')
  await page.getByRole('button', { name: 'Revisar cambios', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar y guardar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
