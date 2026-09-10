import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'react-refresh/only-export-components': [
        'error',
        { allowExportNames: ['useAuth', 'useLocationRequest'] },
      ],
      // Repository interfaces deliberately stay asynchronous, including local adapters.
      '@typescript-eslint/require-await': 'off',
    },
  },
  { files: ['**/*.test.{ts,tsx}'], rules: { '@typescript-eslint/unbound-method': 'off' } },
])
