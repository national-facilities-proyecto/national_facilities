import { expect, test } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { checklistCase, login } from './helpers.js'

function gate() {
  let release = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

for (const width of [320, 1440]) {
  test(`carga a ${width}px: conserva el portal y reserva el espacio del mapa`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    checklistCase()
    const routeGate = gate()
    const mapGate = gate()
    await page.route(/\/assets\/RoutesPage-[^/]+\.js$/, async (route) => {
      await routeGate.promise
      await route.continue()
    })
    await page.route(/\/assets\/AssignedLocationsMap-[^/]+\.js$/, async (route) => {
      await mapGate.promise
      await route.continue()
    })
    await page.route('https://tiles.openfreemap.org/**', (route) => route.abort())
    await login(page)
    await expect(page.getByRole('heading', { name: 'Mis Checklist', exact: true })).toBeVisible()
    const navigation = page.getByRole('navigation', {
      name: width < 1024 ? 'Accesos del técnico' : 'Navegación principal',
    })
    try {
      await navigation.getByRole('link', { name: 'Mis Rutas', exact: true }).click()
      await expect(page.locator('#main-content .nf-loading--list')).toBeVisible()
      await expect(page.getByRole('button', { name: /Perfil de/ })).toBeVisible()
      await expect(navigation).toBeVisible()
      await expect(page.getByRole('status')).toContainText('Preparando tu vista')
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      if (width === 320) {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        expect(
          await page
            .locator('.nf-skeleton')
            .first()
            .evaluate((node) => getComputedStyle(node, '::after').animationName),
        ).toBe('none')
      }
      await page.screenshot({ path: `test-results/loading-route-${width}.png`, fullPage: true })
      routeGate.release()
      await expect(page.locator('.nf-loading--map')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Hoy', exact: true })).toBeVisible()
      const placeholder = await page.locator('.nf-loading--map').boundingBox()
      const placeholderCard = await page
        .getByRole('region', { name: 'Mapa de tiendas', exact: true })
        .boundingBox()
      await page.screenshot({ path: `test-results/loading-map-${width}.png`, fullPage: true })
      mapGate.release()
      await expect(page.locator('.nf-map-container')).toBeVisible()
      const map = await page.locator('.nf-map-container').boundingBox()
      const mapCard = await page
        .getByRole('region', { name: 'Mapa de tiendas', exact: true })
        .boundingBox()
      expect(placeholder?.height).toBe(map?.height)
      expect(placeholderCard?.height).toBe(mapCard?.height)
    } finally {
      routeGate.release()
      mapGate.release()
    }
  })
}
