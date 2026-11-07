import { expect, test } from '@playwright/test'
import { login } from './helpers.js'

test('auditoría: persistencia de descripción al cambiar de vista', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page, 'store')
  await page.goto('/supervisor/tickets/new')
  const field = page.getByLabel('Descripción del problema')
  const description = 'Incidencia sin enviar: el técnico detecta una avería eléctrica.'
  await field.fill(description)
  await expect(field).toHaveValue(description)
  await page.screenshot({ path: 'test-results/apf3-draft-before-navigation.png' })

  await page.getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Mis incidencias' }).click()
  await expect(page).toHaveURL(/\/supervisor\/tickets$/)
  await page.getByRole('link', { name: 'Registrar incidencia' }).click()
  await expect(page).toHaveURL(/\/supervisor\/tickets\/new$/)
  const value = await page.getByLabel('Descripción del problema').inputValue()
  console.log('APF3_DRAFT_RECOVERY', JSON.stringify({
    lengthBefore: description.length,
    lengthAfter: value.length,
    preserved: value === description,
  }))
  await page.screenshot({ path: 'test-results/apf3-draft-after-navigation.png' })
})
