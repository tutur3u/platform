import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  ...compat.extends('@ncthub/eslint-config/react-internal.js'),
  {
    languageOptions: {
      parser: tsParser,
    },

    rules: {
      'no-redeclare': 'off',
    },
  },
];
