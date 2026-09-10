import { chromium } from '@playwright/test'
import lighthouse from 'lighthouse'
import { preview } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'

// Local demo only: no credentials or production data are included in this audit.
const server = await preview({
  mode: 'demo',
  preview: { host: '127.0.0.1', port: 5175, strictPort: true },
})
let browser
try {
  browser = await chromium.launch({
    channel: process.env.PW_CHANNEL || undefined,
    args: ['--remote-debugging-port=9223'],
  })
  const result = await lighthouse('http://127.0.0.1:5175/login', {
    port: 9223,
    logLevel: 'error',
    output: 'html',
    onlyCategories: ['performance', 'accessibility', 'best-practices'],
  })
  if (!result || result.lhr.runtimeError)
    throw new Error(result?.lhr.runtimeError?.message ?? 'Lighthouse no generó resultados.')
  await mkdir('test-results', { recursive: true })
  await writeFile('test-results/lighthouse-login.html', result.report)
  await writeFile('test-results/lighthouse-login.json', JSON.stringify(result.lhr, null, 2))
  const summary = {
    version: result.lhr.lighthouseVersion,
    fetchedAt: result.lhr.fetchTime,
    url: result.lhr.finalDisplayedUrl,
    scope:
      'Login demo, navegación móvil simulada, localhost. No mide dispositivos reales ni todos los portales.',
    scores: Object.fromEntries(
      Object.entries(result.lhr.categories).map(([name, category]) => [name, category.score]),
    ),
    metrics: Object.fromEntries(
      [
        'first-contentful-paint',
        'largest-contentful-paint',
        'total-blocking-time',
        'cumulative-layout-shift',
        'speed-index',
      ].map((name) => [
        name,
        { value: result.lhr.audits[name].numericValue, unit: result.lhr.audits[name].numericUnit },
      ]),
    ),
    warnings: result.lhr.runWarnings,
  }
  await writeFile('docs/lighthouse-summary.json', JSON.stringify(summary, null, 2) + '\n')
  console.log(summary)
} finally {
  await browser?.close()
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  )
}
