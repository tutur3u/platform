// Composes the full change set for converting one Next satellite to the
// bridge. Planning reads only; `applyPlan` writes. Re-planning an applied app
// yields no file changes and no commands.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  API_REGISTRY,
  DEPENDENCIES,
  GENERATED_MARKER,
  nativeScripts,
  PAGE_MANIFEST,
  PAGE_MODULES,
  PUBLIC_ASSETS,
  ROUTES_CONFIG_FILE,
} from './contract.mjs';
import { inventoryApp, walk } from './inventory.mjs';
import {
  addBiomeRouteTreeIgnore,
  addCiWorkflow,
  addHeldRecord,
  addPackageScripts,
  addPolicyTestApp,
  addProtectedSurface,
  addTsconfigExcludes,
  addVercelProductionPolicyGate,
  dependencyCommands,
} from './repo-edits.mjs';
import * as templates from './templates.mjs';

export const DEFAULT_SERVER_ONLY = [
  '@tuturuuu/satellite/auth',
  '@tuturuuu/utils/api-proxy-guard',
  '@tuturuuu/supabase/next/server',
];

const APP_ID = /^[a-z][a-z0-9-]*$/u;

function read(repoRoot, relative) {
  const full = path.join(repoRoot, relative);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}

function devPort(manifest) {
  const match = /PORT:-(\d+)/u.exec(manifest.scripts?.['dev:app'] ?? '');
  return match ? Number(match[1]) : 3000;
}

function defaultLocale(repoRoot, app) {
  const source = read(repoRoot, `apps/${app}/src/i18n/routing.ts`) ?? '';
  return /defaultLocale\s*=\s*['"]([a-z-]+)['"]/u.exec(source)?.[1] ?? 'en';
}

export function routesConfig(existing, inventory, locale) {
  const defaults = {
    appDir: inventory.appDir,
    api: { out: API_REGISTRY },
    pages: { out: PAGE_MANIFEST },
    stripSegments: inventory.hasLocaleSegment ? { '[locale]': { locale } } : {},
    owned: {},
    ignored: {},
  };
  // Hand-maintained owned/ignored entries and overrides always win.
  return { ...defaults, ...(existing ?? {}) };
}

export function planConversion(repoRoot, app, options = {}) {
  if (!APP_ID.test(app)) throw new Error(`Invalid app id: ${app}`);
  const appPath = `apps/${app}`;
  const appRoot = path.join(repoRoot, appPath);
  const inventory = inventoryApp(repoRoot, app);
  const manifestSource = read(repoRoot, `${appPath}/package.json`);
  const manifest = JSON.parse(manifestSource);
  const navigation = options.navigation ?? 'router';
  const resolved = {
    app,
    appDir: inventory.appDir,
    navigation,
    serverOnlySpecifiers: options.serverOnlySpecifiers ?? DEFAULT_SERVER_ONLY,
    workerName: `tuturuuu-${app}-vite-staging`,
    rootHost: options.rootHost ?? `${app}.tuturuuu.com`,
    proxyModule: inventory.proxy
      ? `../${inventory.proxy.replace(/\.ts$/u, '')}`
      : null,
    // The same proxy as seen from the generated `src/start-bridge/` modules.
    pageProxyModule: inventory.proxy
      ? path.posix.relative(
          'src/start-bridge',
          inventory.proxy.replace(/\.ts$/u, '')
        )
      : null,
    publicFiles: walk(path.join(appRoot, 'public')),
  };
  const problems = [];
  if (!inventory.proxy)
    problems.push(`${appPath}: no src/proxy.ts; the bridge handler needs one`);

  const writes = [];
  const owned = (relative, content) =>
    writes.push({
      path: `${appPath}/${relative}`,
      content,
      owner: 'generated',
    });
  const edited = (relative, content) => {
    const before = read(repoRoot, relative);
    if (before !== null && before !== content)
      writes.push({ path: relative, content, owner: 'edit' });
  };

  const existingConfig = read(repoRoot, `${appPath}/${ROUTES_CONFIG_FILE}`);
  const config = routesConfig(
    existingConfig ? JSON.parse(existingConfig) : null,
    inventory,
    defaultLocale(repoRoot, app)
  );
  writes.push({
    path: `${appPath}/${ROUTES_CONFIG_FILE}`,
    content: `${JSON.stringify(config, null, 2)}\n`,
    owner: 'merged',
  });

  const ignoredPages = new Set([
    ...Object.keys(config.ignored ?? {}),
    ...Object.keys(config.owned ?? {}),
  ]);
  owned('vite.config.mts', templates.viteConfig(resolved));
  owned('void.config.ts', templates.voidConfig(resolved));
  owned('tsconfig.cloudflare.json', templates.cloudflareTsconfig(resolved));
  if (resolved.proxyModule)
    owned('cloudflare/worker.ts', templates.workerEntry(resolved));
  owned(PUBLIC_ASSETS, templates.publicAssetsModule(resolved));
  owned('src/start-bridge/page-route.tsx', templates.pageRouteModule(resolved));
  owned(
    PAGE_MODULES,
    templates.pageModulesModule({
      ...resolved,
      pages: inventory.pages
        .filter((page) => !page.structural && !ignoredPages.has(page.file))
        .map((page) => ({ file: page.file, wrappers: page.wrappers })),
    })
  );
  owned('src/start.ts', templates.startEntry(resolved));
  owned('src/router.tsx', templates.routerEntry(resolved));
  owned('src/routes/__root.tsx', templates.rootRoute(resolved));
  owned('src/routes/index.tsx', templates.pageRouteFile({ app, path: '/' }));
  owned('src/routes/$.tsx', templates.pageRouteFile({ app, path: '/$' }));
  writes.push({
    path: `${appPath}/src/routeTree.gen.ts`,
    content: templates.ROUTE_TREE,
    owner: 'tool-generated',
  });

  const codegen = options.codegen
    ? options.codegen(appRoot, config)
    : { generated: [], errors: ['codegen not configured'] };
  problems.push(...codegen.errors.map((error) => `codegen: ${error}`));
  for (const output of codegen.generated)
    writes.push({
      path: `${appPath}/${output.path}`,
      content: output.content,
      owner: 'tool-generated',
    });

  const scripts = addPackageScripts(
    manifestSource,
    nativeScripts(devPort(manifest))
  );
  problems.push(
    ...scripts.conflicts.map((item) => `package.json script ${item}`)
  );
  if (scripts.source !== manifestSource)
    writes.push({
      path: `${appPath}/package.json`,
      content: scripts.source,
      owner: 'edit',
    });

  const tsconfigPath = `${appPath}/tsconfig.json`;
  const tsconfig = read(repoRoot, tsconfigPath);
  if (tsconfig === null) problems.push(`${tsconfigPath}: missing`);
  else {
    try {
      const next = addTsconfigExcludes(tsconfig);
      if (next !== tsconfig)
        writes.push({ path: tsconfigPath, content: next, owner: 'edit' });
    } catch (error) {
      problems.push(error.message);
    }
  }

  let ci = read(repoRoot, 'tuturuuu.ci.ts');
  // The held record freezes the app's Vercel production publisher, so it is
  // opt-in: conversion PRs leave production alone and each app's cutover-prep
  // PR applies `--hold` just before the flip.
  if (options.hold) ci = addHeldRecord(ci, app);
  if (options.workflow) ci = addCiWorkflow(ci, `${app}-cloudflare.yaml`);
  edited('tuturuuu.ci.ts', ci);
  if (options.hold) {
    const policyPath = 'scripts/ci/production-publication-policy.ts';
    edited(policyPath, addProtectedSurface(read(repoRoot, policyPath), app));
    const policyTestPath = 'scripts/ci/production-publication-policy.test.js';
    edited(
      policyTestPath,
      addPolicyTestApp(read(repoRoot, policyTestPath), app)
    );
    const vercelWorkflow = `.github/workflows/vercel-production-${app}.yaml`;
    const vercelSource = read(repoRoot, vercelWorkflow);
    if (vercelSource === null)
      problems.push(
        `${vercelWorkflow}: missing; the held-record regression expects a Vercel publisher per protected app`
      );
    else
      edited(vercelWorkflow, addVercelProductionPolicyGate(vercelSource, app));
  }
  edited(
    'biome.json',
    addBiomeRouteTreeIgnore(read(repoRoot, 'biome.json'), app)
  );
  if (options.workflow)
    writes.push({
      path: `.github/workflows/${app}-cloudflare.yaml`,
      content: options.workflow(resolved),
      owner: 'generated',
    });

  // Void loads exactly one local env file (`.env`) and rejects the rest;
  // the example moves to `env.example` like Calendar and Meet.
  const removals = [];
  const legacyExample = read(repoRoot, `${appPath}/.env.example`);
  if (legacyExample !== null) {
    if (read(repoRoot, `${appPath}/env.example`) !== null)
      problems.push(`${appPath}: both .env.example and env.example exist`);
    else {
      writes.push({
        path: `${appPath}/env.example`,
        content: legacyExample,
        owner: 'rename',
      });
      removals.push(`${appPath}/.env.example`);
    }
  }

  return {
    app,
    inventory,
    removals,
    resolved,
    config,
    writes: classifyWrites(
      repoRoot,
      formatWrites(writes, options.format, appPath)
    ),
    commands: dependencyCommands(manifestSource, DEPENDENCIES).map((argv) => ({
      argv,
      cwd: appPath,
    })),
    problems,
  };
}

const FORMATTABLE = /\.(?:[cm]?[jt]sx?|json)$/u;

/**
 * Formats owned output with the repository's Biome so generated files are
 * lint-clean as written. `*.bridge.gen.ts` and tool output are excluded from
 * Biome and keep their generator bytes.
 */
export function createBiomeFormatter(repoRoot, spawn = spawnSync) {
  return (relativePath, content) => {
    const result = spawn(
      'bun',
      [
        'x',
        '--no-install',
        'biome',
        'format',
        `--stdin-file-path=${relativePath}`,
      ],
      { cwd: repoRoot, input: content, encoding: 'utf8', timeout: 30000 }
    );
    if (result.status !== 0)
      throw new Error(
        `biome format failed for ${relativePath}: ${(result.stderr ?? '').trim()}`
      );
    return result.stdout;
  };
}

function formatWrites(writes, format, appPath) {
  if (!format) return writes;
  // Owned files, plus the app's own JSON edits (package.json, tsconfig.json).
  const formattable = (write) =>
    write.owner === 'generated' ||
    (write.owner === 'edit' &&
      write.path.startsWith(`${appPath}/`) &&
      write.path.endsWith('.json'));
  return writes.map((write) =>
    formattable(write) &&
    FORMATTABLE.test(write.path) &&
    !write.path.endsWith('.bridge.gen.ts')
      ? { ...write, content: format(write.path, write.content) }
      : write
  );
}

/**
 * Marks each write as create/update/unchanged and refuses to replace an
 * unmarked hand-written file unless it is adopted explicitly.
 */
function classifyWrites(repoRoot, writes) {
  return writes.map((write) => {
    const before = read(repoRoot, write.path);
    const status =
      before === null
        ? 'create'
        : before === write.content
          ? 'unchanged'
          : 'update';
    const conflict =
      status === 'update' &&
      write.owner === 'generated' &&
      !before.includes(GENERATED_MARKER);
    return { ...write, before, status, conflict };
  });
}

export function pendingWrites(plan) {
  return plan.writes.filter((write) => write.status !== 'unchanged');
}
