import js from '@eslint/js';
import security from 'eslint-plugin-security';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

// Static analysis for the frontend (React/Vite SPA). eslint:recommended + eslint-plugin-security
// for real bugs/security footguns, plus the two React-specific plugins that catch the mistakes that
// actually break a React app at runtime (stale closures over hook dependencies, state updates that
// don't survive Fast Refresh) rather than style preferences.
export default [
  js.configs.recommended,
  security.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2023, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Without this, core ESLint has no idea that `<IncomePage />` "uses" the IncomePage import -
      // it only understands JSX as markup, not as a reference - so every component imported for JSX
      // rendering gets wrongly flagged as unused.
      'react/jsx-uses-vars': 'error',
      // Only the two long-standing, universally-adopted hooks rules - not eslint-plugin-react-hooks
      // v7's full "recommended" set, which is tuned for React Compiler readiness (banning patterns
      // like setState-in-effect-on-mount that are normal, working React without the compiler). Those
      // would flag a large amount of this project's existing, tested code as "errors" for a style
      // the project was never written against.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', args: 'none', varsIgnorePattern: '^_' }],
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['**/*.test.{js,jsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, vi: 'readonly' } },
    rules: {
      // Test files intentionally poke at internals/mock data with dynamic keys.
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      // Fast Refresh only matters for files Vite hot-reloads during development; test helper
      // files that mix exported constants, hooks and components are normal and not a problem here.
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**'],
  },
];
