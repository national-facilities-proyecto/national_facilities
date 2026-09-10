import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { readConfig } from './src/app/config.ts'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  if (command === 'build') readConfig({ ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env })
  return { plugins: [react()] }
})
