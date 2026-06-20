#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
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

async function generateTanstackRouteTree({
  appDir = DEFAULT_TANSTACK_WEB_DIR,
  importPath,
  logger = console,
  rootDir = ROOT_DIR,
} = {}) {
  const resolvedImportPath =
    importPath ??
    resolveRouterGeneratorImportPath({ rootDir, tanstackWebDir: appDir });
  const { Generator, getConfig } = getRouterGeneratorExports(
    await import(resolvedImportPath)
  );
  const config = getConfig(
    { routeTreeFileFooter: [...START_REGISTRATION_FOOTER] },
    appDir
  );
  const generator = new Generator({ config, root: rootDir });

  await generator.run();

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
  ROUTER_GENERATOR_PACKAGE,
  START_REGISTRATION_FOOTER,
  generateTanstackRouteTree,
  getRouterGeneratorExports,
  parseArgs,
  resolveRouterGeneratorImportPath,
};
