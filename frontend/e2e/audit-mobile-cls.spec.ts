import { expect, test } from '@playwright/test'
import { login } from './helpers.js'

type ShiftSample = {
  time: number
  value: number
  sources: string[]
}

test('auditoría móvil: identifica elementos desplazados en /checklists', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    const scope = window as typeof window & { __nfLayoutShifts?: ShiftSample[] }
    scope.__nfLayoutShifts = []
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number
          hadRecentInput?: boolean
          sources?: Array<{ node?: Element }>
        }
        if (shift.hadRecentInput) continue
        const sources = (shift.sources ?? []).map(({ node }) => {
          if (!(node instanceof Element)) return '(elemento no disponible)'
          return [
            node.tagName.toLowerCase(),
            node.id ? `#${node.id}` : '',
            typeof node.className === 'string'
              ? node.className.trim().split(/\\s+/).slice(0, 3).map((c) => `.${c}`).join('')
              : '',
          ].join('')
        })
        scope.__nfLayoutShifts?.push({
          time: Math.round(entry.startTime),
          value: shift.value,
          sources,
        })
      }
    })
    observer.observe({ type: 'layout-shift', buffered: true })
  })

  await login(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Mis Checklist', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Perfil de/ })).toBeVisible()
  await page.waitForTimeout(2500)

  const shifts = await page.evaluate(
    () =>
      (window as typeof window & { __nfLayoutShifts?: ShiftSample[] }).__nfLayoutShifts ?? [],
  )
  const ranked = [...shifts].sort((a, b) => b.value - a.value).slice(0, 10)
  const rawTotal = shifts.reduce((sum, entry) => sum + entry.value, 0)
  console.log(
    'APF3_CLS_CHECKLISTS_MOBILE',
    JSON.stringify({ viewport: '390x844', shifts: shifts.length, rawTotal, ranked }),
  )
  await page.screenshot({ path: 'test-results/apf3-checklists-mobile.png', fullPage: true })
  expect(await page.locator('main').isVisible()).toBe(true)
})
