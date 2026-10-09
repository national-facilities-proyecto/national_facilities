import { test, expect } from '@playwright/test'
import { access, api, arrive, checklistCase, login, openResults, object, call } from './helpers.js'

// Cámara sintética: prueba ambas proporciones sin fotografías reales.
test('móvil: cámara completa, rotación, repetir, confirmar y finalización según API', async ({
  page,
  request,
  context,
}) => {
  const token = await access(request, 'tech')
  const id = checklistCase()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await arrive(page, id)
  await openResults(page)
  await page.getByRole('button', { name: 'Conforme', exact: true }).click()
  const exceptional = page.getByRole('complementary', { name: 'Acción excepcional' })
  await expect(exceptional).toContainText('si no se pudo realizar el trabajo')
  await expect(
    exceptional.getByRole('button', { name: 'No pude realizar el trabajo' }),
  ).toHaveClass(/nf-button--quiet/)
  await page.evaluate(() => {
    const tracks: MediaStreamTrack[] = []
    Object.assign(window, { mobileCameraTracks: tracks })
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: () => {
        const canvas = document.createElement('canvas')
        const portrait = innerHeight > innerWidth
        canvas.width = portrait ? 480 : 640
        canvas.height = portrait ? 640 : 480
        const context = canvas.getContext('2d')!
        context.fillStyle = '#42647b'
        context.fillRect(0, 0, canvas.width, canvas.height)
        const stream = canvas.captureStream(5)
        tracks.push(...stream.getTracks())
        return Promise.resolve(stream)
      },
    })
  })
  const camera = page.getByRole('dialog', { name: 'Tomar fotografía', exact: true })
  for (const size of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size)
    await page.getByRole('button', { name: 'Tomar foto', exact: true }).click()
    const video = camera.locator('video')
    await expect(camera.getByRole('button', { name: 'Capturar', exact: true })).toBeEnabled()
    const metrics = await video.evaluate((element: HTMLVideoElement) => ({
      width: element.videoWidth,
      height: element.videoHeight,
      fit: getComputedStyle(element).objectFit,
      heightPx: element.getBoundingClientRect().height,
      widthPx: element.getBoundingClientRect().width,
    }))
    const portrait = size.height > size.width
    expect(metrics.width / metrics.height).toBeCloseTo(portrait ? 3 / 4 : 4 / 3)
    expect(metrics.fit).toBe('contain')
    expect(metrics.widthPx).toBeGreaterThan(280)
    expect(metrics.heightPx).toBeGreaterThan(portrait ? 350 : 180)
    const bounds = await camera.boundingBox()
    expect(bounds!.height).toBeLessThan(size.height)
    expect(bounds!.width).toBeLessThan(size.width)
    await camera.getByRole('button', { name: 'Capturar', exact: true }).click()
    const preview = camera.getByAltText('Previsualización de la evidencia')
    await expect(preview).toBeVisible()
    await expect
      .poll(() =>
        preview.evaluate((image: HTMLImageElement) => image.naturalWidth / image.naturalHeight),
      )
      .toBeCloseTo(portrait ? 3 / 4 : 4 / 3)
    await page.screenshot({
      path: `test-results/mobile-camera-${portrait ? 'portrait' : 'landscape'}.png`,
    })
    await camera.getByRole('button', { name: 'Repetir', exact: true }).click()
    await camera.getByRole('button', { name: 'Capturar', exact: true }).click()
    const uploaded = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url() === `${api}/evidencias/`,
    )
    await camera.getByRole('button', { name: 'Confirmar foto', exact: true }).click()
    expect((await uploaded).ok()).toBe(true)
    await expect(camera).toHaveCount(0)
    await expect(page.getByText('Borrador guardado.', { exact: true })).toBeVisible()
  }
  expect(
    await page.evaluate(() =>
      (window as unknown as { mobileCameraTracks: MediaStreamTrack[] }).mobileCameraTracks.every(
        (track) => track.readyState === 'ended',
      ),
    ),
  ).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Finalizar', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar envío', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Trabajo finalizado' })).toBeVisible()
  expect(object(await call(request, `/visitas/${id}/`, token)).status).toBe('completed')
  await page.getByRole('button', { name: 'Volver al listado' }).click()
  await page.goto(`/checklists/${id}/start`)
  await expect(page.getByText('Detalles técnicos', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Historial de excepciones', { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Resultados del checklist', exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/mobile-completed-record.png', fullPage: true })
  const reviewer = await context.newPage()
  await login(reviewer, 'account')
  await reviewer.goto(`/technical-supervisor/checklists/${id}`)
  await reviewer.getByText('Detalles técnicos', { exact: true }).click()
  await expect(reviewer.getByText('Trabajo físico', { exact: true })).toBeVisible()
  await expect(reviewer.getByText('Duración total', { exact: true })).toBeVisible()
  await reviewer.close()
})
