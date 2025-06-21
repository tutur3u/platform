import { resolve } from 'node:path';

const project = resolve(process.cwd(), 'tsconfig.json');

/*
 * This is a custom ESLint configuration for use with
 * internal (bundled by their consumer) libraries
 * that utilize React.
 */

/** @type {import("eslint").Linter.Config} */
const extenstions = ['eslint:recommended', 'turbo'];
export { extenstions as extends };
export const plugins = ['only-warn'];
export const globals = {
  React: true,
  JSX: true,
};
export const env = {
  browser: true,
};
export const settings = {
  'import/resolver': {
    typescript: {
      project,
    },
  },
};
export const ignorePatterns = [
  // Ignore dotfiles
  '.*.js',
  'node_modules/',
  'dist/',
];
export const overrides = [
  // Force ESLint to detect .tsx files
  { files: ['*.js?(x)', '*.ts?(x)'] },
];
