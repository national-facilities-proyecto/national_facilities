import { expect, test } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { login } from './helpers.js'

for (const username of ['tech', 'store', 'account', 'admin']) {
  test(`barra lateral de ${username}: cierre animado, reapertura y navegación en escritorio`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await login(page, username)
    const close = page.getByRole('button', { name: 'Cerrar menú lateral', exact: true })
    const open = page.getByRole('button', { name: 'Abrir menú lateral', exact: true })
    await expect(close).toBeVisible()
    await close.click()
    const intermediate = await page.locator('.nf-body').evaluate(async (element) => {
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      return element.getBoundingClientRect().x
    })
    expect(intermediate).toBeGreaterThan(0)
    expect(intermediate).toBeLessThan(240)
    await expect
      .poll(() => page.locator('.nf-body').evaluate((el) => el.getBoundingClientRect().x))
      .toBe(0)
    await expect(page.locator('#portal-sidebar')).toHaveAttribute('inert', '')
    await expect(open).toBeFocused()
    await open.click()
    await expect(close).toBeFocused()
    await expect
      .poll(() => page.locator('.nf-body').evaluate((el) => el.getBoundingClientRect().x))
      .toBe(240)
    await expect(close).toBeVisible()
    const links = page
      .getByRole('navigation', { name: 'Navegación principal', exact: true })
      .getByRole('link')
    for (const link of await links.all()) {
      await link.click()
      await expect(page.locator('main h1')).toBeVisible()
      await expect(close).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    if (username === 'account')
      await page.screenshot({ path: 'test-results/sidebar-national-desktop.png' })
  })

  test(`barra móvil de ${username}: apertura y cierre fluidos, Escape y navegación`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page, username)
    const trigger = page.getByRole('button', { name: 'Abrir menú', exact: true })
    const drawer = page.getByRole('dialog', { name: 'Menú de navegación', exact: true })
    await trigger.click()
    await expect(drawer).toBeVisible()
    await expect
      .poll(() => drawer.evaluate((el) => Math.round(el.getBoundingClientRect().x)))
      .toBe(0)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    const bounds = await drawer.boundingBox()
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
    if (username === 'account')
      await page.screenshot({ path: 'test-results/sidebar-national-mobile.png' })
    await drawer.getByRole('button', { name: 'Cerrar Menú de navegación', exact: true }).click()
    // The dialog remains mounted so the browser can animate its exit.
    expect(
      await page.locator('.nf-navigation-modal').evaluate((el) => el.getAnimations().length),
    ).toBeGreaterThan(0)
    await expect(drawer).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await trigger.click()
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
    await trigger.click()
    await drawer.getByRole('link').last().click()
    await expect(drawer).toHaveCount(0)
    await expect(page.locator('main h1')).toBeVisible()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await trigger.click()
    await expect(drawer).toBeVisible()
    expect(
      await drawer.evaluate((el) => Number.parseFloat(getComputedStyle(el).transitionDuration)),
    ).toBeLessThan(0.01)
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
  })
}
