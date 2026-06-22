#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_TANSTACK_WEB_DIR = path.join(ROOT_DIR, 'apps', 'tanstack-web');
const ROUTER_GENERATOR_PACKAGE = '@tanstack/router-generator';
const START_REGISTRATION_FOOTER = Object.freeze([
  '',
  "import type { getRouter } from './router.tsx'",
  "import type { createStart } from '@tanstack/react-start'",
  "declare module '@tanstack/react-start' {",
  '  interface Register {',
  '    ssr: true',
  '    router: Awaited<ReturnType<typeof getRouter>>',
  '  }',
  '}',
]);
const START_REGISTRATION_FOOTER_BLOCK = START_REGISTRATION_FOOTER.join('\n');
const ROUTE_TREE_FORMATTER_CONFIG = Object.freeze({
  formatter: {
    enabled: true,
    indentStyle: 'space',
    indentWidth: 2,
    lineEnding: 'lf',
    lineWidth: 80,
  },
  javascript: {
    formatter: {
      quoteStyle: 'single',
      semicolons: 'always',
      trailingCommas: 'es5',
    },
  },
});

function getStartRegistrationFooter() {
  return [START_REGISTRATION_FOOTER_BLOCK];
}

function resolveRouterGeneratorImportPath({
  fsImpl = fs,
  resolvePackage = require.resolve,
  rootDir = ROOT_DIR,
  tanstackWebDir = DEFAULT_TANSTACK_WEB_DIR,
} = {}) {
  const searchRoots = [tanstackWebDir, rootDir];

  for (const searchRoot of searchRoots) {
    try {
      return pathToFileURL(
        resolvePackage(ROUTER_GENERATOR_PACKAGE, { paths: [searchRoot] })
      ).href;
    } catch (error) {
      if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }

  const bunStoreFallback = path.join(
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

  if (fsImpl.existsSync(bunStoreFallback)) {
    return pathToFileURL(bunStoreFallback).href;
  }

  throw new Error(
    `Unable to resolve ${ROUTER_GENERATOR_PACKAGE}. Run bun install before regenerating the TanStack route tree.`
  );
}

function getRouterGeneratorExports(moduleNamespace) {
  const moduleExports = moduleNamespace.default ?? moduleNamespace;
  const Generator = moduleNamespace.Generator ?? moduleExports.Generator;
  const getConfig = moduleNamespace.getConfig ?? moduleExports.getConfig;

  if (typeof Generator !== 'function' || typeof getConfig !== 'function') {
    throw new Error(
      `${ROUTER_GENERATOR_PACKAGE} did not expose Generator and getConfig.`
    );
  }

  return { Generator, getConfig };
}

function runCommand(command, args, { cwd = ROOT_DIR } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} ${args.join(' ')} terminated with signal ${signal}`
            : `${command} ${args.join(' ')} exited with code ${code}`
        )
      );
    });
  });
}

async function formatGeneratedRouteTree({
  configDir = os.tmpdir(),
  formatterCommand = 'bunx',
  fsImpl = fs.promises,
  generatedRouteTree,
  rootDir = ROOT_DIR,
  run = runCommand,
} = {}) {
  if (!generatedRouteTree) {
    throw new Error('formatGeneratedRouteTree requires generatedRouteTree.');
  }

  const tempDir = await fsImpl.mkdtemp(
    path.join(configDir, 'tanstack-route-tree-format-')
  );
  const configPath = path.join(tempDir, 'biome.json');

  try {
    await fsImpl.writeFile(
      configPath,
      `${JSON.stringify(ROUTE_TREE_FORMATTER_CONFIG, null, 2)}\n`
    );
    await run(
      formatterCommand,
      [
        'biome',
        'format',
        '--write',
        '--config-path',
        configPath,
        generatedRouteTree,
      ],
      { cwd: rootDir }
    );
  } finally {
    await fsImpl.rm(tempDir, { recursive: true, force: true });
  }
}

async function generateTanstackRouteTree({
  appDir = DEFAULT_TANSTACK_WEB_DIR,
  formatRouteTree = true,
  formatterCommand = 'bunx',
  importPath,
  logger = console,
  rootDir = ROOT_DIR,
  runFormatter = formatGeneratedRouteTree,
} = {}) {
  const resolvedImportPath =
    importPath ??
    resolveRouterGeneratorImportPath({ rootDir, tanstackWebDir: appDir });
  const { Generator, getConfig } = getRouterGeneratorExports(
    await import(resolvedImportPath)
  );
  const config = getConfig(
    { routeTreeFileFooter: getStartRegistrationFooter },
    appDir
  );
  const generator = new Generator({ config, root: rootDir });

  await generator.run();

  if (formatRouteTree) {
    await runFormatter({
      formatterCommand,
      generatedRouteTree: config.generatedRouteTree,
      rootDir,
    });
  }

  const relativeRouteTreePath = path.relative(
    rootDir,
    config.generatedRouteTree
  );
  logger.log(`Generated ${relativeRouteTreePath}`);

  return {
    generatedRouteTree: config.generatedRouteTree,
    importPath: resolvedImportPath,
  };
}

function parseArgs(argv) {
  const args = {
    appDir: DEFAULT_TANSTACK_WEB_DIR,
    rootDir: ROOT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--app-dir') {
      const value = argv[index + 1];
      if (!value) throw new Error('--app-dir requires a value.');
      args.appDir = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg === '--root-dir') {
      const value = argv[index + 1];
      if (!value) throw new Error('--root-dir requires a value.');
      args.rootDir = path.resolve(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

if (require.main === module) {
  generateTanstackRouteTree(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_TANSTACK_WEB_DIR,
  ROOT_DIR,
  ROUTE_TREE_FORMATTER_CONFIG,
  ROUTER_GENERATOR_PACKAGE,
  START_REGISTRATION_FOOTER,
  START_REGISTRATION_FOOTER_BLOCK,
  formatGeneratedRouteTree,
  generateTanstackRouteTree,
  getRouterGeneratorExports,
  getStartRegistrationFooter,
  parseArgs,
  resolveRouterGeneratorImportPath,
  runCommand,
};
