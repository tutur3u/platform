// Inventories a Next App Router satellite and classifies each page for the
// bridge's generic page adapter. Classification follows the page's local
// import graph, so a client component that calls a server action blocks the
// page that renders it.

import fs from 'node:fs';
import path from 'node:path';
import {
  BRIDGE_DIR,
  NEUTRAL_SPECIFIERS,
  SHIMMED_SPECIFIERS,
} from './contract.mjs';

const ROUTE_FILE = /(?:^|\/)(route|page)\.(?:[cm]?[jt]sx?)$/u;
const SPECIAL_FILE =
  /(?:^|\/)(layout|template|loading|error|not-found|global-error|default)\.(?:[cm]?[jt]sx?)$/u;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'];
const FRAMEWORK_PREFIX = /^(?:next(?:\/|$)|next-intl(?:\/|$)|@opennextjs\/)/u;
const MAX_GRAPH_FILES = 4000;

export function walk(root, directory = root, fsImpl = fs) {
  if (!fsImpl.existsSync(directory)) return [];
  return fsImpl
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink() || entry.name === 'node_modules') return [];
      if (entry.isDirectory()) return walk(root, full, fsImpl);
      return [path.relative(root, full).split(path.sep).join('/')];
    })
    .sort();
}

/** Value (non type-only) module specifiers imported or re-exported. */
export function importSpecifiers(source) {
  const specifiers = new Set();
  const statement =
    /(?:^|[;\n}])\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/gu;
  for (const match of source.matchAll(statement)) {
    if (match[2]) continue;
    const clause = match[3].trim();
    // `import { type A, type B } from` is type-only too.
    if (/^\{[^}]*\}$/u.test(clause)) {
      const names = clause
        .slice(1, -1)
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      if (names.length > 0 && names.every((name) => name.startsWith('type ')))
        continue;
    }
    specifiers.add(match[4]);
  }
  for (const match of source.matchAll(
    /(?:^|[^.\w])import\s*(?:\(\s*)?['"]([^'"]+)['"]/gu
  ))
    specifiers.add(match[1]);
  return specifiers;
}

function directive(source) {
  const body = source.replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/u, '');
  const match = /^['"](use (?:client|server))['"]/u.exec(body);
  return match ? match[1] : null;
}

function hasInlineServerAction(source) {
  return /\{\s*['"]use server['"]/u.test(source);
}

export function createResolver(appRoot, fsImpl = fs) {
  const srcRoot = path.join(appRoot, 'src');
  const isFile = (candidate) =>
    fsImpl.existsSync(candidate) && fsImpl.statSync(candidate).isFile();
  return function resolve(fromFile, specifier) {
    let base;
    if (specifier.startsWith('.'))
      base = path.resolve(path.dirname(fromFile), specifier);
    else if (specifier.startsWith('@/'))
      base = path.join(srcRoot, specifier.slice(2));
    else return null;
    const candidates = [
      base,
      ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
      ...SOURCE_EXTENSIONS.map((extension) =>
        path.join(base, `index${extension}`)
      ),
    ];
    return candidates.find(isFile) ?? null;
  };
}

/**
 * Blockers reachable from `entry` through local imports. Results are cached
 * per file across pages; cycles are handled by the visited set.
 */
export function createGraphAnalyzer(
  appRoot,
  fsImpl = fs,
  shimmed = SHIMMED_SPECIFIERS
) {
  const resolve = createResolver(appRoot, fsImpl);
  const fileFacts = new Map();
  const factsOf = (file) => {
    const cached = fileFacts.get(file);
    if (cached) return cached;
    const source = fsImpl.readFileSync(file, 'utf8');
    const specifiers = [...importSpecifiers(source)];
    const facts = {
      directive: directive(source),
      inlineServerAction: hasInlineServerAction(source),
      framework: specifiers.filter((specifier) =>
        FRAMEWORK_PREFIX.test(specifier)
      ),
      local: specifiers
        .map((specifier) => resolve(file, specifier))
        .filter(Boolean),
    };
    fileFacts.set(file, facts);
    return facts;
  };
  return function analyze(entry, wrappers = []) {
    const blockers = new Map();
    const features = new Set();
    const visited = new Set();
    const queue = [entry, ...wrappers];
    while (queue.length > 0 && visited.size < MAX_GRAPH_FILES) {
      const file = queue.shift();
      if (visited.has(file)) continue;
      visited.add(file);
      if (!SOURCE_EXTENSIONS.includes(path.extname(file))) continue;
      const facts = factsOf(file);
      const label = path.relative(appRoot, file).split(path.sep).join('/');
      if (file === entry && facts.directive === 'use client')
        features.add('client-page');
      // 'use server' runs through the bridge's action transport
      // (start/server-actions); it is a feature, not a blocker.
      if (facts.directive === 'use server' || facts.inlineServerAction)
        features.add('server-action');
      for (const specifier of facts.framework) {
        features.add(specifier);
        if (!shimmed.has(specifier) && !NEUTRAL_SPECIFIERS.has(specifier))
          blockers.set(`unshimmed:${specifier}`, label);
      }
      queue.push(...facts.local);
    }
    return {
      features: [...features].sort(),
      blockers: [...blockers.entries()]
        .map(([reason, file]) => ({ reason, file }))
        .sort((a, b) => a.reason.localeCompare(b.reason)),
      files: visited.size,
    };
  };
}

/** Layouts and templates that wrap a page, outermost first. */
export function wrappersOf(file, files) {
  const segments = file.split('/').slice(0, -1);
  const wrappers = [];
  for (let depth = 0; depth <= segments.length; depth++) {
    const prefix = segments.slice(0, depth).join('/');
    for (const candidate of files) {
      const match = /^(.*?)(?:^|\/)(layout|template)\.(?:[cm]?[jt]sx?)$/u.exec(
        candidate
      );
      if (match && match[1] === prefix) wrappers.push(candidate);
    }
  }
  return wrappers;
}

function segmentError(file) {
  const segments = file.split('/').slice(0, -1);
  if (segments.some((segment) => segment.startsWith('@')))
    return 'parallel route';
  if (segments.some((segment) => /^\(\.{1,3}\)/u.test(segment)))
    return 'intercepting route';
  return null;
}

/**
 * The contract's shims plus every key of the bridge preset's `NEXT_SHIMS`,
 * so coverage follows the bridge as it gains shims.
 */
export function loadShimmedSpecifiers(repoRoot, fsImpl = fs) {
  const shimmed = new Set(SHIMMED_SPECIFIERS);
  const preset = path.join(repoRoot, BRIDGE_DIR, 'src/vite/preset.ts');
  if (!fsImpl.existsSync(preset)) return shimmed;
  const source = fsImpl.readFileSync(preset, 'utf8');
  const block = /NEXT_SHIMS\s*=\s*\{([\s\S]*?)\}\s*as const/u.exec(source);
  for (const match of (block?.[1] ?? '').matchAll(/['"]([^'"]+)['"]\s*:/gu))
    shimmed.add(match[1]);
  // RSC mode resolves fonts per environment in `startBridgeRscPlugin`.
  const rsc = path.join(repoRoot, BRIDGE_DIR, 'src/vite/rsc.ts');
  const rscSource = fsImpl.existsSync(rsc)
    ? fsImpl.readFileSync(rsc, 'utf8')
    : '';
  for (const font of ['next/font/google', 'next/font/local'])
    if (rscSource.includes(`'${font}'`)) shimmed.add(font);
  return shimmed;
}

/** Full inventory for `apps/<app>`; `appDir` is relative to the app root. */
export function inventoryApp(repoRoot, app, options = {}) {
  const fsImpl = options.fsImpl ?? fs;
  const appRoot = path.join(repoRoot, 'apps', app);
  if (!fsImpl.existsSync(path.join(appRoot, 'package.json')))
    throw new Error(`apps/${app}: no package.json`);
  const appDir = options.appDir ?? 'src/app';
  const appDirRoot = path.join(appRoot, appDir);
  const files = walk(appDirRoot, appDirRoot, fsImpl);
  const analyze = createGraphAnalyzer(
    appRoot,
    fsImpl,
    options.shimmed ?? loadShimmedSpecifiers(repoRoot, fsImpl)
  );
  const pages = [];
  const routes = [];
  const specials = [];
  for (const file of files) {
    const route = ROUTE_FILE.exec(file);
    if (route) {
      const entry = { file, structural: segmentError(file) };
      if (route[1] === 'page') {
        const wrappers = wrappersOf(file, files);
        const graph = analyze(
          path.join(appDirRoot, file),
          wrappers.map((wrapper) => path.join(appDirRoot, wrapper))
        );
        const blockers = entry.structural
          ? [
              { reason: `structure:${entry.structural}`, file },
              ...graph.blockers,
            ]
          : graph.blockers;
        pages.push({
          ...entry,
          wrappers,
          features: graph.features,
          blockers,
          generic: blockers.length === 0,
        });
      } else routes.push(entry);
      continue;
    }
    const special = SPECIAL_FILE.exec(file);
    if (special) specials.push({ file, kind: special[1] });
  }
  const exists = (relative) => fsImpl.existsSync(path.join(appRoot, relative));
  const proxy = ['src/proxy.ts', 'src/middleware.ts'].find(exists) ?? null;
  const generic = pages.filter((page) => page.generic).length;
  return {
    app,
    appDir,
    proxy,
    pages,
    routes,
    specials,
    hasLocaleSegment: files.some((file) => file.startsWith('[locale]/')),
    native: {
      viteConfig: ['vite.config.mts', 'vite.config.ts'].find(exists) ?? null,
      voidConfig: exists('void.config.ts'),
      worker: exists('cloudflare/worker.ts'),
      startRoutes: walk(path.join(appRoot, 'src/routes'), undefined, fsImpl),
    },
    coverage: {
      pages: pages.length,
      generic,
      ratio: pages.length === 0 ? 1 : generic / pages.length,
    },
  };
}
