// Composes the full change set for converting one Next satellite to the
// bridge. Planning reads only; `applyPlan` writes. Re-planning an applied app
// yields no file changes and no commands.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { readAppConfig } from './app-config.mjs';
import {
  artifactHelper,
  callerPath,
  callerWorkflow,
  NATIVE_TEMPLATE,
  RUNTIME_COMMAND,
  RUNTIME_TEST,
  runtimeTest,
  workspaceClosure,
} from './ci-templates.mjs';
import {
  API_ENTRY,
  API_PATTERNS,
  API_REGISTRY,
  APP_BASE,
  APP_CONFIG,
  BRIDGE_DIR,
  CENTRAL_FIRST,
  DEPENDENCIES,
  GENERATED_MARKER,
  nativeScripts,
  OG_PACKAGE,
  OG_VERSION,
  PAGE_MANIFEST,
  PAGE_MODULES,
  PUBLIC_ASSETS,
  ROUTES_CONFIG_FILE,
  SEO_POLICY,
} from './contract.mjs';
import { inventoryApp, walk } from './inventory.mjs';
import {
  addBiomeRouteTreeOverride,
  addCiWorkflow,
  addGitignoreEntries,
  addHeldRecord,
  addPackageScripts,
  addPolicyTestApp,
  addProtectedSurface,
  addTsconfigExcludes,
  addVercelProductionPolicyGate,
  dependencyCommands,
  VOID_OUTPUT_IGNORES,
} from './repo-edits.mjs';
import {
  resolveRuntimeProbes,
  runtimeExpectationProblems,
} from './runtime-outcome.mjs';
import * as templates from './templates.mjs';
import {
  effectiveWorkerConfig,
  workerConfigProblems,
} from './worker-config.mjs';

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

/** JSON with sorted object keys: equal values compare equal in any layout. */
const canonicalJson = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        )
      : item
  );

const NEXT_CONFIGS = ['next.config.ts', 'next.config.mjs', 'next.config.js'];

/**
 * Generator inputs read from the app's existing configuration, so apps
 * regenerate instead of forking generated files: the proxy's own
 * `config.matcher`, the Web workspace API paths its `next.config` rewrites
 * `beforeFiles` (`centralFirst`), `next/og` use, whether internal-api
 * offers the default app-base resolver (#6764), and whether the bridge
 * exports the portable `AssetsBinding` (#6753).
 */
export function detectInputs(repoRoot, appPath, inventory, manifest) {
  const proxySource = inventory.proxy
    ? (read(repoRoot, `${appPath}/${inventory.proxy}`) ?? '')
    : '';
  const nextConfig = NEXT_CONFIGS.map((file) =>
    read(repoRoot, `${appPath}/${file}`)
  ).find((source) => source !== null);
  const sources = walk(path.join(repoRoot, appPath, 'src'))
    .filter((file) => /\.[cm]?[jt]sx?$/u.test(file) && !/\.test\./u.test(file))
    .map((file) => read(repoRoot, `${appPath}/src/${file}`) ?? '');
  const internalApi =
    read(repoRoot, 'packages/internal-api/src/internal-api-url.ts') ?? '';
  const deps = { ...manifest.dependencies, ...manifest.devDependencies };
  const bridgeExports =
    JSON.parse(read(repoRoot, `${BRIDGE_DIR}/package.json`) ?? '{}').exports ??
    {};
  return {
    proxyMatcher: /export\s+const\s+config\b/u.test(proxySource),
    workspaceApiCentralFirst: /createTuturuuuWebWorkspaceApiRewrites/u.test(
      nextConfig ?? ''
    ),
    og: sources.some((source) => /from\s+['"]next\/og['"]/u.test(source)),
    appBase:
      /export function registerDefaultAppBaseResolver/u.test(internalApi) &&
      '@tuturuuu/internal-api' in deps,
    assetsBinding: './assets' in bridgeExports,
  };
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
    // Lazy: a route's dependencies load on its first request, not at startup.
    api: { out: API_REGISTRY, patternsOut: API_PATTERNS, lazy: true },
    pages: { out: PAGE_MANIFEST },
    stripSegments: inventory.hasLocaleSegment ? { '[locale]': { locale } } : {},
    owned: {},
    ignored: {},
    // What the generated runtime test expects of public pages: a status, or
    // `{ "redirect": "<path or URL prefix>" }`. Not merely "no 5xx".
    runtime: { '/': 200 },
  };
  // Hand-maintained owned/ignored entries and overrides always win; an
  // existing `api` gains the client-safe pattern list unless it opts out.
  const merged = { ...defaults, ...(existing ?? {}) };
  if (existing?.api) merged.api = { ...defaults.api, ...existing.api };
  return merged;
}

/** Owned app paths the native template's Biome check covers. */
const NATIVE_FORMAT_PATHS = [
  'src/start-bridge',
  'src/routes',
  'src/router.tsx',
  'src/start.ts',
  'cloudflare',
  'vite.config.mts',
  'void.config.ts',
  'tsconfig.json',
  'package.json',
  'start-bridge.routes.json',
];

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
    ...detectInputs(repoRoot, appPath, inventory, manifest),
  };
  const problems = [];
  // App-owned Worker options shape the generated Worker config.
  const appConfig = (options.loadAppConfig ?? readAppConfig)(
    path.join(appRoot, APP_CONFIG)
  );
  if (appConfig.error)
    problems.push(`${appPath}/${APP_CONFIG}: ${appConfig.error}`);
  const mounts = templates.defaultMounts(resolved);
  for (const problem of workerConfigProblems(appConfig.config, mounts))
    problems.push(`${appPath}/${APP_CONFIG}: ${problem}`);
  resolved.worker = effectiveWorkerConfig(appConfig.config, mounts);
  // The Worker's mounts as the app configured them (root-only apps claim no
  // apex mount in the generated source).
  resolved.mounts = { ...mounts, ...appConfig.config?.mounts };
  // The app's robots allowlist, emitted into the Worker (no runtime JSON).
  resolved.seoPolicy =
    JSON.parse(read(repoRoot, SEO_POLICY) ?? '{}')[app] ?? null;
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
  for (const problem of runtimeExpectationProblems(config.runtime))
    problems.push(`${appPath}/${ROUTES_CONFIG_FILE}: ${problem}`);
  const hasBuildInfo = inventory.routes.some(
    (route) => route.file === 'api/build-info/route.ts'
  );
  const probes = resolveRuntimeProbes(config.runtimeProbes, {
    expectations: config.runtime,
    hasBuildInfo,
  });
  // An unchanged config keeps its bytes (however Biome laid it out); a
  // changed one is formatted with the owned output.
  const unchanged =
    existingConfig !== null &&
    canonicalJson(JSON.parse(existingConfig)) === canonicalJson(config);
  writes.push({
    path: `${appPath}/${ROUTES_CONFIG_FILE}`,
    content: unchanged
      ? existingConfig
      : `${JSON.stringify(config, null, 2)}\n`,
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
  owned(CENTRAL_FIRST, templates.centralFirstModule(resolved));
  // App-owned: created once so generated files never need hand edits.
  if (read(repoRoot, `${appPath}/${APP_CONFIG}`) === null)
    writes.push({
      path: `${appPath}/${APP_CONFIG}`,
      content: templates.appConfigModule(resolved),
      owner: 'app-owned',
    });
  owned(API_ENTRY, templates.apiEntryModule(resolved));
  if (resolved.appBase) owned(APP_BASE, templates.appBaseModule(resolved));
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

  // Native CI: a caller of the reusable template, once the repository has it.
  const nativeCi = read(repoRoot, NATIVE_TEMPLATE) !== null;
  const scripts = addPackageScripts(
    manifestSource,
    nativeCi
      ? {
          ...nativeScripts(devPort(manifest)),
          'test:runtime': RUNTIME_COMMAND,
        }
      : nativeScripts(devPort(manifest))
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
  if (nativeCi) ci = addCiWorkflow(ci, `${app}-cloudflare.yaml`);
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
  edited('biome.json', addBiomeRouteTreeOverride(read(repoRoot, 'biome.json')));
  // Local `vp build` output must not show up as changes (check:changed).
  const gitignorePath = `${appPath}/.gitignore`;
  const gitignore = read(repoRoot, gitignorePath);
  const ignored = addGitignoreEntries(gitignore, VOID_OUTPUT_IGNORES);
  if (ignored !== (gitignore ?? ''))
    writes.push({ path: gitignorePath, content: ignored, owner: 'edit' });
  if (nativeCi) {
    for (const problem of probes.problems)
      problems.push(`${appPath}/${ROUTES_CONFIG_FILE}: ${problem}`);
    owned(
      RUNTIME_TEST,
      runtimeTest({
        ...resolved,
        expectations: config.runtime,
        hasBuildInfo,
        probes: probes.probes,
      })
    );
    writes.push(
      {
        path: callerPath(app),
        content: callerWorkflow({
          ...resolved,
          packageName: manifest.name,
          // Include the workspace packages --apply is about to add
          // (@tuturuuu/start-bridge), so the first run's filters equal the
          // re-run's.
          closure: workspaceClosure(repoRoot, {
            ...manifest,
            dependencies: {
              ...manifest.dependencies,
              ...DEPENDENCIES.dependencies,
            },
          }),
          hasTestScript: Boolean(manifest.scripts?.test),
          formatPaths: NATIVE_FORMAT_PATHS,
        }),
        owner: 'generated',
      },
      {
        path: `scripts/ci/${app}-native-artifact.py`,
        content: artifactHelper(resolved),
        owner: 'generated',
      }
    );
  }

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
    commands: dependencyCommands(
      manifestSource,
      resolved.og
        ? {
            ...DEPENDENCIES,
            dependencies: {
              ...DEPENDENCIES.dependencies,
              [OG_PACKAGE]: OG_VERSION,
            },
          }
        : DEPENDENCIES
    ).map((argv) => ({
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
        // Format plus safe fixes (organized imports), as check:changed checks.
        'check',
        '--write',
        `--stdin-file-path=${relativePath}`,
      ],
      { cwd: repoRoot, input: content, encoding: 'utf8', timeout: 30000 }
    );
    if (result.status !== 0)
      throw new Error(
        `biome check failed for ${relativePath}: ${(result.stderr ?? '').trim()}`
      );
    return result.stdout;
  };
}

function formatWrites(writes, format, appPath) {
  if (!format) return writes;
  // Owned files, the merged routes config, and the app's own JSON edits
  // (package.json, tsconfig.json).
  const formattable = (write) =>
    write.owner === 'generated' ||
    write.owner === 'app-owned' ||
    write.owner === 'merged' ||
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
