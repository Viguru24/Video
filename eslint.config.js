import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src-tauri/**', 'scratch/**', '.cosmo_models/**', '.cosmo_cpu_venv/**', 'gfpgan/**', 'companion-android/**', 'test_models/**', 'pyinstaller_build/**', 'pyinstaller_build_cpu/**', 'backup/**', 'electron/**', 'CosmoSymphony-Package/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'no-control-regex': 'off',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
])
