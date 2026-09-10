import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: [
        'src/mocks/**/*.ts',
        'src/features/auth/session.ts',
        'src/features/checklists/validation.ts',
        'src/features/geolocation/location.ts',
        'src/utils/*.ts',
        'src/services/errors.ts',
        'src/services/evidence.ts',
        'src/app/config.ts',
      ],
      exclude: ['src/**/*.test.*'],
      thresholds: { statements: 75, lines: 75, functions: 70, branches: 65 },
    },
  },
})
