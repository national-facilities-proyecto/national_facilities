import { expect, test } from '@playwright/test'
import { login } from './helpers.js'

type Shift = {
  time: number
  value: number
  nodes: string[]
}

test('auditoría móvil: desplazamientos en /checklists', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    const history: Shift[] = []
    const root = window as Window & { __nfShifts?: Shift[] }
    root.__nfShifts = history
    const observer = new PerformanceObserver((list) => {
      for (const item of list.getEntries()) {
        const entry = item as PerformanceEntry & {
          hadRecentInput?: boolean
          value: number
          sources?: Array<{ node?: Element }>
        }
        if (entry.hadRecentInput) continue
        history.push({
          time: Math.round(entry.startTime),
          value: entry.value,
          nodes: (entry.sources ?? []).map(({ node }) => {
            const tag = node?.tagName.toLowerCase() ?? '?'
            const cls = node?.getAttribute('class')?.split(' ')[0] ?? ''
            return `${tag}${cls ? `.${cls}` : ''}`
          }),
        })
      }
    })
    observer.observe({ type: 'layout-shift', buffered: true })
  })

  await login(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Mis Checklist' })).toBeVisible()
  await page.waitForTimeout(2500)

  const shifts = await page.evaluate(() => {
    const root = window as Window & { __nfShifts?: Shift[] }
    return root.__nfShifts ?? []
  })
  console.log('APF3_LAYOUT_SHIFTS', JSON.stringify(shifts))
  await page.screenshot({ path: 'test-results/apf3-mobile-cls.png', fullPage: true })
})
