import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// El repositorio tiene tres tipos de JavaScript que no se parecen en nada, y
// antes todos caian en el mismo bloque `**/*.{js,jsx}` con globals de
// navegador. Por eso cada `require`, `module` y `process` del backend salia
// como no-undef: ESLint lo estaba leyendo como si corriera en el navegador.
export default defineConfig([
  globalIgnores(['dist']),

  // Frontend: navegador, modulos ESM y React. Son .ts/.tsx, no .js: el patron
  // `{js,jsx}` que habia aqui no coincidia con un solo archivo, asi que los 62
  // archivos de la app nunca se revisaron y las reglas de hooks nunca
  // llegaron a correr. `tseslint.configs.recommended` aporta el parser, sin el
  // ESLint no sabe leer sintaxis de TypeScript.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // La regla base de ESLint no entiende firmas de TypeScript y marca
      // falsos positivos; la version de tseslint la reemplaza.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Backend: Node y CommonJS. Sin `sourceType: 'commonjs'`, ESLint asume
  // modulos ESM y `require` no existe. Las reglas de React no aplican aqui.
  {
    files: ['backend/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs',
    },
  },

  // Configuracion del proyecto (vite.config.js, este mismo archivo): corre en
  // Node pero se escribe con ESM.
  {
    files: ['*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
      sourceType: 'module',
    },
  },
])
