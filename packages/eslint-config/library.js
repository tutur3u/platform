import { resolve } from 'node:path';

const project = resolve(process.cwd(), 'tsconfig.json');

/** @type {import("eslint").Linter.Config} */
const extensions = ['eslint:recommended', 'turbo'];
export { extensions as extends };
export const plugins = ['only-warn'];
export const globals = {
  React: true,
  JSX: true,
};
export const env = {
  node: true,
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
  {
    files: ['*.js?(x)', '*.ts?(x)'],
  },
];
