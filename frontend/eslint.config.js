// Minimal flat config: catches undefined variables (e.g. a component used but
// never imported), unused imports and invalid React hook usage.
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        location: 'readonly',
        history: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        Math: 'readonly',
        JSON: 'readonly',
        Date: 'readonly',
        Promise: 'readonly',
        Error: 'readonly',
        String: 'readonly',
        Number: 'readonly',
        Boolean: 'readonly',
        Array: 'readonly',
        Object: 'readonly',
        RegExp: 'readonly',
        Symbol: 'readonly',
        parseInt: 'readonly',
        parseFloat: 'readonly',
        isNaN: 'readonly',
        structuredClone: 'readonly',
        queueMicrotask: 'readonly',
        requestAnimationFrame: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { varsIgnorePattern: '^_', args: 'none' }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];

