const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
  ROOT_DIR,
  ROUTER_GENERATOR_PACKAGE,
  START_REGISTRATION_FOOTER,
  getRouterGeneratorExports,
  parseArgs,
  resolveRouterGeneratorImportPath,
} = require('./generate-tanstack-route-tree.js');

test('Start registration footer preserves Cloudflare-compatible TanStack Start types', () => {
  const footer = START_REGISTRATION_FOOTER.join('\n');

  assert.match(footer, /import type \{ getRouter \} from '\.\/router\.tsx'/u);
  assert.match(footer, /import type \{ createStart \}/u);
  assert.match(footer, /declare module '@tanstack\/react-start'/u);
  assert.match(footer, /router: Awaited<ReturnType<typeof getRouter>>/u);
});

test('resolveRouterGeneratorImportPath prefers normal package resolution', () => {
  const resolved = path.join(ROOT_DIR, 'node_modules', 'generator', 'index.js');
  const importPath = resolveRouterGeneratorImportPath({
    resolvePackage: (packageName, options) => {
      assert.equal(packageName, ROUTER_GENERATOR_PACKAGE);
      assert.ok(options.paths.some((entry) => entry.endsWith('tanstack-web')));
      return resolved;
    },
  });

  assert.equal(importPath, pathToFileURL(resolved).href);
});

test('resolveRouterGeneratorImportPath falls back to Bun store symlink', () => {
  const rootDir = path.join(path.sep, 'repo');
  const fallbackPath = path.join(
    rootDir,
    'node_modules',
    '.bun',
    'node_modules',
    '@tanstack',
    'router-generator',
    'dist',
    'esm',
    'index.js'
  );

  const importPath = resolveRouterGeneratorImportPath({
    fsImpl: {
      existsSync: (filePath) => filePath === fallbackPath,
    },
    resolvePackage: () => {
      const error = new Error('missing');
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    },
    rootDir,
    tanstackWebDir: path.join(rootDir, 'apps', 'tanstack-web'),
  });

  assert.equal(importPath, pathToFileURL(fallbackPath).href);
});

test('getRouterGeneratorExports accepts ESM and CJS-like namespaces', () => {
  class Generator {}
  const getConfig = () => ({});

  assert.deepEqual(getRouterGeneratorExports({ Generator, getConfig }), {
    Generator,
    getConfig,
  });
  assert.deepEqual(
    getRouterGeneratorExports({ default: { Generator, getConfig } }),
    { Generator, getConfig }
  );
  assert.throws(
    () => getRouterGeneratorExports({ default: {} }),
    /Generator and getConfig/u
  );
});

test('parseArgs resolves optional root and app directories', () => {
  assert.deepEqual(parseArgs([]), {
    appDir: path.join(ROOT_DIR, 'apps', 'tanstack-web'),
    rootDir: ROOT_DIR,
  });
  assert.deepEqual(parseArgs(['--root-dir', '.', '--app-dir', 'apps/x']), {
    appDir: path.resolve('apps/x'),
    rootDir: path.resolve('.'),
  });
  assert.throws(() => parseArgs(['--app-dir']), /requires a value/u);
  assert.throws(() => parseArgs(['--bad']), /Unknown argument/u);
});
