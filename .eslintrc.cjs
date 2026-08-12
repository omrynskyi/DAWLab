module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: [
    'dist',
    'dist-electron',
    'release',
    'node_modules',
    '*.config.js',
    '*.config.ts',
    '.eslintrc.cjs',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react-refresh'],
  rules: {
    // This codebase intentionally types on-disk VCS log/registry objects as
    // `any` (dynamic, schema-versioned JSON). Enforcing explicit types here
    // would mean hundreds of casts with no safety gain.
    '@typescript-eslint/no-explicit-any': 'off',
    // HMR-only hint; not relevant to how components are organized here.
    'react-refresh/only-export-components': 'off',
    // Allow deliberately-unused args/vars when prefixed with `_` (e.g. `_ev`,
    // `_event`), the convention already used across the IPC handlers.
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    // Empty `catch {}` is a deliberate "best-effort, ignore failure" pattern here.
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
  overrides: [
    {
      // Vitest hoists `vi.mock`/`vi.hoisted` factories above imports, so these
      // files must use `require()` inside them — imports aren't available yet.
      files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
      rules: { '@typescript-eslint/no-var-requires': 'off' },
    },
  ],
}
