import { expect, test } from '@playwright/test'

// MVT water con un punto; se ejercita el parser y renderer reales, sin contactar AWS.
const tile = Buffer.from([
  26, 23, 10, 5, 119, 97, 116, 101, 114, 18, 9, 8, 1, 24, 1, 34, 3, 9, 2, 2, 40, 128, 32, 120, 2,
])
const primary = 'https://tiles.openfreemap.org/**'
const backup = 'https://maps.example.test/**'
const fixture = '/map-tests/fixtures/map.html'

test('OpenFreeMap carga en Leaflet real sin consultar AWS', async ({ page }) => {
  let backupRequests = 0
  await page.route(primary, (route) =>
    route.fulfill({ contentType: 'application/x-protobuf', body: tile }),
  )
  await page.route(backup, (route) => {
    backupRequests++
    return route.abort()
  })
  await page.goto(fixture)
  await expect(page.locator('.nf-map-status')).toHaveCount(0)
  await expect(page.locator('.nf-marker')).toHaveCount(2)
  expect(backupRequests).toBe(0)
  await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenFreeMap')
})

for (const failure of ['http', 'network', 'corrupt', 'timeout'] as const) {
  test(`${failure} del principal activa AWS y conserva marcadores, vista y controles`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route(primary, async (route) => {
      if (failure === 'network') return route.abort('failed')
      if (failure === 'timeout') return // Sin respuesta: se espera el timeout del componente.
      return route.fulfill({ status: failure === 'http' ? 503 : 200, body: '<html>error</html>' })
    })
    await page.route(backup, (route) =>
      route.fulfill({ contentType: 'application/x-protobuf', body: tile }),
    )
    await page.goto(fixture)
    await expect(page.getByText('Usando cartografía de respaldo de AWS.')).toBeVisible({
      timeout: 20000,
    })
    await expect(page.locator('.nf-map-status')).toHaveCount(0)
    await expect(page.locator('.nf-marker')).toHaveCount(2)
    await expect(page.locator('.leaflet-tile-container')).toHaveCount(1)
    await expect(page.locator('.leaflet-control-zoom')).toBeVisible()
    await expect(page.locator('.leaflet-control-attribution')).toContainText('Cartografía propia')
    const marker = page.getByRole('button', { name: 'Tienda piloto Lima', exact: true })
    await marker.click()
    await expect(page.getByRole('link', { name: 'Cómo llegar', exact: true })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=-12.1739,-77.0181',
    )
    expect(errors).toEqual([])
    if (failure === 'http') {
      await page.locator('.leaflet-popup-close-button').click()
      await expect(page.locator('.leaflet-popup')).toHaveCount(0)
      await page.screenshot({ path: 'test-results/map-aws-fallback.png', fullPage: true })
    }
  })
}

test('fallan ambos orígenes, quedan tiendas accesibles y el reintento recupera el principal', async ({
  page,
}) => {
  let recovered = false
  let backupRequests = 0
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route(primary, (route) =>
    route.fulfill({
      status: recovered ? 200 : 503,
      contentType: 'application/x-protobuf',
      body: recovered ? tile : Buffer.from('unavailable'),
    }),
  )
  await page.route(backup, (route) => {
    backupRequests++
    return route.fulfill({ status: 403, body: 'unavailable' })
  })
  await page.goto(fixture)
  await expect(page.getByRole('alert')).toContainText('Mapa no disponible')
  const list = page.getByRole('list', { name: 'Tiendas asignadas sin mapa' })
  await expect(list.getByRole('link')).toHaveCount(2)
  await expect(page.locator('.nf-marker')).toHaveCount(2)
  await expect(page.locator('.leaflet-tile-container')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/map-both-failed.png', fullPage: true })
  const requestsAfterFailure = backupRequests
  recovered = true
  await page.getByRole('button', { name: 'Reintentar mapa', exact: true }).click()
  await expect(page.locator('.nf-map-status')).toHaveCount(0)
  await expect(list).toHaveCount(0)
  await expect(page.locator('.nf-marker')).toHaveCount(2)
  expect(backupRequests).toBe(requestsAfterFailure)
  expect(errors).toEqual([])
})
