import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
const tile = Buffer.from([
  26, 23, 10, 5, 119, 97, 116, 101, 114, 18, 9, 8, 1, 24, 1, 34, 3, 9, 2, 2, 40, 128, 32, 120, 2,
])
const primary = 'https://tiles.openfreemap.org/**'
async function open(page: Page) {
  await page.goto('/map-tests/fixtures/map.html')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        })
      })
  })
  await page.getByRole('button', { name: 'Cargar visor de prueba' }).click()
  await expect(page.locator('.nf-map-container')).toBeVisible()
}
async function cachedAsset(page: Page) {
  return page.evaluate(async () => {
    const name = (await caches.keys()).find((key) => key.startsWith('nf-map-assets-'))!
    const cache = await caches.open(name)
    return { name, url: (await cache.keys())[0].url }
  })
}
test.beforeEach(async ({ context }) => {
  await context.route(primary, (route) =>
    route.fulfill({ contentType: 'application/x-protobuf', body: tile }),
  )
})

test('worker real reutiliza un archivo propio almacenado estando offline y excluye teselas/API/HTML', async ({
  page,
  context,
}) => {
  await open(page)
  await expect(page.locator('.nf-map-status')).toHaveCount(0)
  await expect(page.locator('.nf-marker')).toHaveCount(2)
  const saved = await cachedAsset(page)
  await page.evaluate(async () => {
    await fetch('/api/probe-cache-exclusion')
    await fetch('/')
  })
  const urls = await page.evaluate(async () => {
    const name = (await caches.keys()).find((key) => key.startsWith('nf-map-assets-'))!
    return (await (await caches.open(name)).keys()).map((key) => key.url)
  })
  expect(urls.length).toBeGreaterThan(0)
  expect(
    urls.every(
      (url) =>
        new URL(url).origin === new URL(saved.url).origin &&
        /\/assets\/.*\.(js|css|geojson)$/.test(url),
    ),
  ).toBe(true)
  expect(urls.some((url) => /openfreemap|\/api\/|\.pbf/.test(url))).toBe(false)
  await context.setOffline(true)
  const result = await page.evaluate(async (url) => {
    const response = await fetch(url)
    return {
      ok: response.ok,
      body: (await response.text()).length,
      savedAt: response.headers.get('x-nf-map-saved-at'),
    }
  }, saved.url)
  expect(result.ok).toBe(true)
  expect(result.body).toBeGreaterThan(0)
  expect(result.savedAt).not.toBeNull()
})

test('recurso propio eliminado falla offline y se recupera al volver la red', async ({
  page,
  context,
}) => {
  await open(page)
  await expect(page.locator('.nf-map-status')).toHaveCount(0)
  const saved = await cachedAsset(page)
  await page.evaluate(async ({ name, url }) => {
    await (await caches.open(name)).delete(url)
  }, saved)
  await context.setOffline(true)
  expect(
    await page.evaluate(async (url) => {
      try {
        await fetch(url)
        return false
      } catch {
        return true
      }
    }, saved.url),
  ).toBe(true)
  await context.setOffline(false)
  expect(await page.evaluate(async (url) => (await fetch(url)).ok, saved.url)).toBe(true)
  expect(
    await page.evaluate(
      async ({ name, url }) => Boolean(await (await caches.open(name)).match(url)),
      saved,
    ),
  ).toBe(true)
})

test('caducidad real en Cache Storage: no sirve un archivo vencido sin red y lo renueva online', async ({
  page,
  context,
}) => {
  await open(page)
  await expect(page.locator('.nf-map-status')).toHaveCount(0)
  const saved = await cachedAsset(page)
  await page.evaluate(async ({ name, url }) => {
    const cache = await caches.open(name)
    const old = (await cache.match(url))!
    const headers = new Headers(old.headers)
    headers.set('x-nf-map-saved-at', '1')
    await cache.put(url, new Response(await old.arrayBuffer(), { headers }))
  }, saved)
  await context.setOffline(true)
  expect(
    await page.evaluate(async (url) => {
      try {
        await fetch(url)
        return false
      } catch {
        return true
      }
    }, saved.url),
  ).toBe(true)
  await context.setOffline(false)
  expect(await page.evaluate(async (url) => (await fetch(url)).ok, saved.url)).toBe(true)
})

for (const failure of ['http', 'network', 'corrupt', 'timeout'] as const) {
  test(`fallo ${failure} de OpenFreeMap conserva tiendas y reintento sin respaldo inventado`, async ({
    page,
    context,
  }) => {
    let recovered = false
    await context.route(primary, async (route) => {
      if (recovered) return route.fulfill({ contentType: 'application/x-protobuf', body: tile })
      if (failure === 'network') return route.abort('failed')
      if (failure === 'timeout') return
      return route.fulfill({ status: failure === 'http' ? 503 : 200, body: '<html>error</html>' })
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await open(page)
    await expect(
      page.getByText(
        'El mapa principal no está disponible. Se está utilizando cartografía simplificada',
      ),
    ).toBeVisible({ timeout: 18000 })
    await expect(page.locator('.leaflet-overlay-pane path')).not.toHaveCount(0)
    await expect(page.locator('.nf-marker')).toHaveCount(2)
    await expect(page.locator('.leaflet-tile-container')).toHaveCount(0)
    if (failure === 'http') {
      await page.screenshot({ path: 'test-results/map-local-geojson.png', fullPage: true })
    }
    recovered = true
    await page.getByRole('button', { name: 'Reintentar mapa principal', exact: true }).click()
    await expect(page.locator('.nf-map-status')).toHaveCount(0)
    await expect(page.locator('.nf-marker')).toHaveCount(2)
    await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenFreeMap')
    expect(errors).toEqual([])
  })
}
