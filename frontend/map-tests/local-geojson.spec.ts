import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
const primary = 'https://tiles.openfreemap.org/**'
const geo = '**/assets/lima-pilot-*.geojson'
const message = 'El mapa principal no está disponible. Se está utilizando cartografía simplificada'
async function open(page: Page, outside = false) {
  await page.goto('/map-tests/fixtures/map.html' + (outside ? '?outside=1' : ''))
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      )
  })
  await page.getByRole('button', { name: 'Cargar visor de prueba' }).click()
  await expect(page.locator('.nf-map-container')).toBeVisible()
}
test('el principal correcto no solicita el GeoJSON local', async ({ page, context }) => {
  let localRequests = 0
  context.on('request', (request) => {
    if (request.url().endsWith('.geojson')) localRequests++
  })
  await context.route(primary, (route) =>
    route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.alloc(0) }),
  )
  await open(page)
  await expect(page.locator('.nf-map-status')).toHaveCount(0)
  expect(localRequests).toBe(0)
  await expect(page.getByText(message)).toHaveCount(0)
})
test('el respaldo conserva marcadores y vista, permite zoom y no consulta servicios externos al interactuar', async ({
  page,
  context,
}) => {
  let tileRequests = 0
  await context.route(primary, (route) => {
    tileRequests++
    return route.fulfill({ status: 503 })
  })
  await open(page)
  const marker = await page.locator('.nf-marker').first().elementHandle()
  await expect(page.getByText(message)).toBeVisible()
  const before = await page
    .locator('.nf-marker')
    .first()
    .evaluate((element) => element.getAttribute('style'))
  const requestsAtFallback = tileRequests
  await expect(page.locator('.leaflet-control-attribution')).toContainText(
    'Cartografía simplificada',
  )
  expect(await marker?.evaluate((element) => element.isConnected)).toBe(true)
  await page.getByRole('button', { name: 'Tienda piloto Lima', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Cómo llegar', exact: true })).toHaveAttribute(
    'href',
    'https://www.google.com/maps/dir/?api=1&destination=-12.1739,-77.0181',
  )
  await page.locator('.leaflet-popup-close-button').click()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(page.locator('.nf-marker').first()).not.toHaveAttribute('style', before ?? '')
  expect(tileRequests).toBe(requestsAtFallback)
  await expect(page.locator('.leaflet-overlay-pane path')).not.toHaveCount(0)
})
for (const failure of ['missing', 'corrupt', 'coverage'] as const) {
  test(`GeoJSON ${failure}: lista final accesible y sin ciclos automáticos`, async ({
    page,
    context,
  }) => {
    let requests = 0
    await context.route(primary, (route) => route.fulfill({ status: 503 }))
    if (failure !== 'coverage')
      await context.route(geo, (route) => {
        requests++
        return route.fulfill({
          status: failure === 'missing' ? 404 : 200,
          contentType: 'application/geo+json',
          body: '{bad json',
        })
      })
    await open(page, failure === 'coverage')
    await expect(page.getByRole('alert')).toContainText('Mapa no disponible')
    if (failure === 'coverage') await expect(page.getByRole('alert')).toContainText('no cubre')
    await expect(
      page.getByRole('list', { name: 'Tiendas asignadas sin mapa' }).getByRole('link'),
    ).toHaveCount(2)
    await expect(page.getByText(message)).toHaveCount(0)
    await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(0)
    if (failure !== 'coverage') expect(requests).toBe(1)
    if (failure === 'coverage')
      await page.screenshot({ path: 'test-results/map-outside-pilot.png', fullPage: true })
  })
}
test('el GeoJSON propio se guarda y vuelve a dibujarse offline manteniendo los límites existentes', async ({
  page,
  context,
}) => {
  await context.route(primary, (route) => route.abort('failed'))
  await open(page)
  await expect(page.getByText(message)).toBeVisible()
  const saved = await page.evaluate(async () => {
    const name = (await caches.keys()).find((key) => key.startsWith('nf-map-assets-'))!
    const cache = await caches.open(name)
    const keys = await cache.keys()
    const geoKey = keys.find((key) => key.url.endsWith('.geojson'))!
    return {
      url: geoKey.url,
      count: keys.length,
      size: Number((await cache.match(geoKey))!.headers.get('x-nf-map-bytes')),
    }
  })
  expect(saved.count).toBeLessThanOrEqual(100)
  expect(saved.size).toBeGreaterThan(500000)
  expect(saved.size).toBeLessThan(10 * 1024 * 1024)
  await context.unroute(primary)
  await context.setOffline(true)
  expect(await page.evaluate(async (url) => (await fetch(url)).ok, saved.url)).toBe(true)
  await page.getByRole('button', { name: 'Reintentar mapa principal' }).click()
  await expect(page.getByText(message)).toBeVisible()
  await expect(page.locator('.leaflet-overlay-pane path')).not.toHaveCount(0)
})
