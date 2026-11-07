import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { readConfig } from './src/app/config.ts'
import { mapAssetPlugin } from './mapAssetPlugin.ts'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  if (command === 'build') readConfig({ ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env })
  return {
    plugins: [react(), mapAssetPlugin()],
    build:
      mode === 'maptest'
        ? {
            rollupOptions: {
              input: { app: resolve('index.html'), map: resolve('map-tests/fixtures/map.html') },
            },
          }
        : undefined,
  }
})
