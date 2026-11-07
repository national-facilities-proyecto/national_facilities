import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './map-tests',
  timeout: 30000,
  expect: { timeout: 10000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    channel: process.env.PW_CHANNEL || (process.env.CI ? undefined : 'msedge'),
    baseURL: 'http://127.0.0.1:5175',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175 --strictPort --mode test',
    url: 'http://127.0.0.1:5175/map-tests/fixtures/map.html',
    reuseExistingServer: false,
    env: { VITE_AWS_MAP_TILES_URL: 'https://maps.example.test/lima/v1/{z}/{x}/{y}.pbf' },
  },
})
