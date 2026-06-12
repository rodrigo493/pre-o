import js from '@eslint/js';
import globals from 'globals';

// NOTE: minimal flat config using only packages already in node_modules
// (@eslint/js, globals). A full TS/React lint needs typescript-eslint,
// eslint-plugin-react-hooks and eslint-plugin-react-refresh, which are NOT yet
// installed (they must pass the dependency-security protocol first). The default
// ESLint parser (espree) cannot parse TS/JSX, so src/**/*.{ts,tsx} are ignored
// here for now. Once the TS plugins are installed, replace this with the full
// config ported from cost-to-love/eslint.config.js.
export default [
  {
    ignores: ['dist', 'node_modules', '**/*.ts', '**/*.tsx'],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
  },
];
