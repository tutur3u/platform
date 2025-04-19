import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  ...compat.config({
    extends: ['next'],
    settings: {
      next: {
        rootDir: 'apps/web/',
      },
    },
  }),
  ...compat.extends('@tuturuuu/eslint-config/library.js'),
  {
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: 'script',

      parserOptions: {
        project: true,
      },
    },
  },
];
