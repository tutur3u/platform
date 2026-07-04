const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
  ROOT_DIR,
  ROUTER_GENERATOR_PACKAGE,
  START_REGISTRATION_FOOTER,
  START_REGISTRATION_FOOTER_BLOCK,
  formatGeneratedRouteTree,
  generateTanstackRouteTree,
  getRouterGeneratorExports,
  getStartRegistrationFooter,
  parseArgs,
  resolveRouterGeneratorImportPath,
} = require('./generate-tanstack-route-tree.js');

test('Start registration footer preserves Cloudflare-compatible TanStack Start types', () => {
  const footer = START_REGISTRATION_FOOTER.join('\n');

  assert.equal(footer, START_REGISTRATION_FOOTER_BLOCK);
  assert.match(footer, /import type \{ getRouter \} from '\.\/router\.tsx'/u);
  assert.match(footer, /import type \{ createStart \}/u);
  assert.match(footer, /declare module '@tanstack\/react-start'/u);
  assert.match(footer, /router: Awaited<ReturnType<typeof getRouter>>/u);
});

test('Start registration footer is emitted as one formatted block', () => {
  assert.deepEqual(getStartRegistrationFooter(), [
    START_REGISTRATION_FOOTER_BLOCK,
  ]);
  assert.doesNotMatch(START_REGISTRATION_FOOTER_BLOCK, /\n\n/u);
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

test('formatGeneratedRouteTree formats ignored generated output with an isolated config', async () => {
  const generatedRouteTree = path.join(
    ROOT_DIR,
    'apps',
    'tanstack-web',
    'src',
    'routeTree.gen.ts'
  );
  const writes = [];
  const removals = [];
  const runs = [];

  await formatGeneratedRouteTree({
    configDir: path.join(path.sep, 'tmp'),
    formatterCommand: 'bunx',
    fsImpl: {
      mkdtemp: async (prefix) => `${prefix}abc123`,
      writeFile: async (filePath, content) =>
        writes.push({ filePath, content }),
      rm: async (filePath, options) => removals.push({ filePath, options }),
    },
    generatedRouteTree,
    rootDir: ROOT_DIR,
    run: async (command, args, options) =>
      runs.push({ command, args, options }),
  });

  assert.equal(writes.length, 1);
  assert.equal(path.basename(writes[0].filePath), 'biome.json');
  assert.match(writes[0].content, /"semicolons": "always"/u);
  assert.match(writes[0].content, /"quoteStyle": "single"/u);
  assert.match(writes[0].content, /"trailingCommas": "all"/u);
  assert.deepEqual(runs, [
    {
      command: 'bunx',
      args: [
        'biome',
        'format',
        '--write',
        '--config-path',
        writes[0].filePath,
        generatedRouteTree,
      ],
      options: { cwd: ROOT_DIR },
    },
  ]);
  assert.deepEqual(removals, [
    {
      filePath: path.dirname(writes[0].filePath),
      options: { recursive: true, force: true },
    },
  ]);
});

test('generateTanstackRouteTree formats the generated route tree after generator output', async () => {
  const globalKey = `__tanstackRouteTreeGeneratorTest${Date.now()}`;
  const generatedRouteTree = path.join(
    ROOT_DIR,
    'apps',
    'tanstack-web',
    'src',
    'routeTree.gen.ts'
  );
  const moduleSource = `
    export class Generator {
      constructor({ config, root }) {
        globalThis[${JSON.stringify(globalKey)}].constructorArgs = { config, root };
      }
      async run() {
        globalThis[${JSON.stringify(globalKey)}].ran = true;
      }
    }
    export function getConfig(options, appDir) {
      globalThis[${JSON.stringify(globalKey)}].configOptions = options;
      globalThis[${JSON.stringify(globalKey)}].footer = options.routeTreeFileFooter();
      globalThis[${JSON.stringify(globalKey)}].appDir = appDir;
      return { generatedRouteTree: ${JSON.stringify(generatedRouteTree)} };
    }
  `;
  const formatterCalls = [];
  const appDir = path.join(ROOT_DIR, 'apps', 'tanstack-web');

  globalThis[globalKey] = {};

  try {
    const result = await generateTanstackRouteTree({
      appDir,
      importPath: `data:text/javascript,${encodeURIComponent(moduleSource)}`,
      logger: { log: () => {} },
      rootDir: ROOT_DIR,
      runFormatter: async (options) => formatterCalls.push(options),
    });

    assert.equal(globalThis[globalKey].ran, true);
    assert.equal(globalThis[globalKey].appDir, appDir);
    assert.deepEqual(globalThis[globalKey].footer, [
      START_REGISTRATION_FOOTER_BLOCK,
    ]);
    assert.equal(globalThis[globalKey].configOptions.quoteStyle, 'single');
    assert.equal(globalThis[globalKey].configOptions.semicolons, true);
    assert.equal(globalThis[globalKey].constructorArgs.root, ROOT_DIR);
    assert.deepEqual(formatterCalls, [
      {
        formatterCommand: 'bunx',
        generatedRouteTree,
        rootDir: ROOT_DIR,
      },
    ]);
    assert.equal(result.generatedRouteTree, generatedRouteTree);
  } finally {
    delete globalThis[globalKey];
  }
});

test('TanStack Start Vite generation uses the same route tree format', () => {
  const viteConfig = fs.readFileSync(
    path.join(ROOT_DIR, 'apps', 'tanstack-web', 'vite.config.ts'),
    'utf8'
  );

  assert.match(viteConfig, /\btanstackStart\s*\(\{/u);
  assert.match(viteConfig, /router:\s*\{[\s\S]*quoteStyle:\s*'single'/u);
  assert.match(viteConfig, /router:\s*\{[\s\S]*semicolons:\s*true/u);
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
