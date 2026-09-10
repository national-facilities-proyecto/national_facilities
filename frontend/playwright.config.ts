import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    channel: process.env.PW_CHANNEL || undefined,
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
    permissions: ['camera', 'geolocation'],
    geolocation: { latitude: -12.1739, longitude: -77.0181, accuracy: 8 },
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: !process.env.CI,
  },
})
