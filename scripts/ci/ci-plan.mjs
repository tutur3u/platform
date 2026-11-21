// One CI plan from the exact diff.
//
// Uncertain plans run every selector. A certain plan names the workspaces to
// test, type-check, lint, build and deploy, and the Cloudflare apps to skip.
// Vercel production selection stays in the Production Deployment Planner.

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { failSafePath, loadExtraEdges, loadGraph } from './affected-apps.mjs';

const FULL_TYPECHECK_FILTER = '--filter=!@tuturuuu/tanstack-web';
const PAUSED_TYPECHECK = '@tuturuuu/tanstack-web';
// Package names are expanded unquoted in the type-check shell. Anything
// outside this set falls back to the full filter.
const SAFE_PACKAGE_NAME = /^[@a-z0-9._/-]+$/u;
// Oxfmt ignores these. Every other changed file runs Oxlint and Oxfmt.
const LINT_IGNORED = /\.(md|mdx|yml|yaml|html|toml|inc)$/iu;

export const BUILD_APPS = [
  'web',
  'learn',
  'admin',
  'mail',
  'contacts',
  'tasks',
];

const NON_TYPECHECK = new Set([
  'apps/docs',
  'apps/mobile',
  'apps/discord',
  'apps/backend',
]);

// Mobile's workflow already path-filters these directories. The planner uses
// the same seeds so a catalog test can reject a new mobile path with no owner.
export const MOBILE_DIRS = [
  'apps/mobile',
  'apps/meet-realtime',
  'packages/realtime',
];

const SHARD_DOC = /\.(md|mdx)$/iu;

// Same rule as scripts/ci/test-docs-only-gate.js. Markdown inside an app or
// package still selects unit tests; only docs and repo prose skip shards.
export function isShardDocumentation(file) {
  if (!SHARD_DOC.test(file)) return false;
  if (file.startsWith('apps/docs/')) return true;
  return !file.startsWith('apps/') && !file.startsWith('packages/');
}

export const SHARED_PATH_FILTERS = new Set([
  'bun.lock',
  'package.json',
  'turbo.json',
  'tuturuuu.ts',
  'tuturuuu.ci.ts',
  'patches/**',
  '.github/actions/**',
  '.github/workflows/ci-check.yml',
  'packages/**',
]);

export function matchWorkflowPath(file, pattern) {
  if (!pattern || pattern.startsWith('!')) return false;
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/gu, '\\$&')
    .replaceAll('**', '\u0000')
    .replaceAll('*', '[^/]*')
    .replaceAll('\u0000', '.*');
  return new RegExp(`^${source}$`, 'u').test(file);
}

export function cloudflareOwnership(workflows) {
  const ownership = {};
  for (const [file, workflow] of Object.entries(workflows)) {
    const app = workflow.jobs?.['affected-gate']?.steps?.find(
      (step) => step.uses === './.github/actions/affected-gate'
    )?.with?.app;
    if (!app || String(app).includes(',')) continue;
    const on = workflow.on ?? {};
    const paths = [
      ...(on.pull_request?.paths ?? []),
      ...(on.push?.paths ?? []),
    ];
    const prefixes = new Set([`apps/${app}/`, `.github/workflows/${file}`]);
    for (const pattern of paths) {
      if (SHARED_PATH_FILTERS.has(pattern) || pattern.startsWith('!')) continue;
      prefixes.add(pattern);
    }
    ownership[app] = [...prefixes].sort();
  }
  return ownership;
}

function dependentsOf(graph, dir) {
  const value =
    graph.dependents instanceof Map
      ? graph.dependents.get(dir)
      : graph.dependents?.[dir];
  return value ? [...value] : [];
}

function ownerOf(file, dirs) {
  return dirs
    .filter((dir) => file === dir || file.startsWith(`${dir}/`))
    .sort((left, right) => right.length - left.length)[0];
}

function openPlan(reason, ownership) {
  const apps = Object.keys(ownership).sort();
  return {
    version: 1,
    uncertain: true,
    reason,
    affected: [],
    test: { run: true, reason, workspaces: [] },
    typecheck: {
      run: true,
      reason,
      narrow: false,
      filters: FULL_TYPECHECK_FILTER,
      workspaces: [],
    },
    lint: { run: true, reason },
    build: { run: true, apps: [...BUILD_APPS], reason },
    mobile: { run: true, reason },
    docs: { run: true, reason },
    cloudflare: { run: apps, skip: [], reason },
    vercel: {
      owner: 'vercel-production.yaml',
      reason:
        'Production Deployment Planner selects Vercel deploys for this diff',
    },
  };
}

function typecheckFilters(names) {
  // Turbo unions positive --filter flags, then subtracts a ! exclusion.
  // `...name` is that package plus its dependents. The paused package stays
  // out. Above 40 names, a missing name, or an unsafe name keeps the
  // exclusion only.
  const selected = names.filter((name) => name && name !== PAUSED_TYPECHECK);
  if (
    selected.length === 0 ||
    selected.length > 40 ||
    selected.some((name) => !SAFE_PACKAGE_NAME.test(name))
  )
    return { narrow: false, filters: FULL_TYPECHECK_FILTER };
  const includes = selected
    .sort()
    .map((name) => `--filter=...${name}`)
    .join(' ');
  return {
    narrow: true,
    filters: `${includes} --filter=!${PAUSED_TYPECHECK}`,
  };
}

function matchesOwnership(file, pattern) {
  if (matchWorkflowPath(file, pattern)) return true;
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return file === prefix || file.startsWith(`${prefix}/`);
  }
  if (pattern.endsWith('/')) return file.startsWith(pattern);
  return file === pattern || file.startsWith(`${pattern}/`);
}

export function buildPlan({ files, graph, extraEdges = {}, ownership = {} }) {
  if (!Array.isArray(files) || !graph?.dirs || !graph.dependents)
    return openPlan('plan input is incomplete', ownership);
  const dirs = [...graph.dirs];
  for (const file of files) {
    if (typeof file !== 'string' || file.length === 0)
      return openPlan('changed path is not a string', ownership);
    if (failSafePath(file))
      return openPlan(
        `changed path requires every selector: ${file}`,
        ownership
      );
    const owned = ownerOf(file, dirs);
    const listed = Object.values(ownership).some((patterns) =>
      patterns.some((pattern) => matchesOwnership(file, pattern))
    );
    if (!owned && !listed && !isShardDocumentation(file))
      return openPlan(
        `changed file outside the workspace graph: ${file}`,
        ownership
      );
  }

  const seeds = new Set();
  for (const file of files) {
    const owner = ownerOf(file, dirs);
    if (owner) seeds.add(owner);
    for (const [prefix, dependents] of Object.entries(extraEdges)) {
      if (
        file.startsWith(prefix) ||
        (prefix.endsWith('/') && file === prefix.slice(0, -1))
      ) {
        for (const dependent of dependents) seeds.add(dependent);
      }
    }
    for (const [app, patterns] of Object.entries(ownership)) {
      if (patterns.some((pattern) => matchesOwnership(file, pattern)))
        seeds.add(`apps/${app}`);
    }
  }
  const affected = new Set(seeds);
  const queue = [...seeds];
  while (queue.length) {
    for (const dependent of dependentsOf(graph, queue.shift())) {
      if (!affected.has(dependent)) {
        affected.add(dependent);
        queue.push(dependent);
      }
    }
  }
  const workspaces = [...affected].sort();
  const names = graph.names ?? {};
  const nameOf = (dir) => (names instanceof Map ? names.get(dir) : names[dir]);
  const reason = files.length
    ? 'workspace closure from the diff'
    : 'no changed files';
  const typecheckWorkspaces = workspaces.filter(
    (dir) => !NON_TYPECHECK.has(dir)
  );
  const filters = typecheckFilters(
    typecheckWorkspaces.map((dir) => nameOf(dir)).filter(Boolean)
  );
  const buildApps = BUILD_APPS.filter((app) => affected.has(`apps/${app}`));
  const cloudflareRun = Object.keys(ownership)
    .filter((app) => affected.has(`apps/${app}`))
    .sort();
  const cloudflareSkip = Object.keys(ownership)
    .filter((app) => !affected.has(`apps/${app}`))
    .sort()
    .map((app) => ({
      id: app,
      reason: `${app} is outside the affected closure`,
    }));
  const docs =
    files.some(
      (file) =>
        isShardDocumentation(file) ||
        file.startsWith('apps/docs/') ||
        /(^|\/)package\.json$/u.test(file) ||
        /(^|\/)page\.tsx$/u.test(file) ||
        /(^|\/)sitemap\.[a-z]+$/u.test(file) ||
        /(^|\/)robots\.[a-z]+$/u.test(file)
    ) ||
    affected.has('apps/docs') ||
    workspaces.some(
      (dir) => dir.startsWith('apps/') || dir === 'packages/utils'
    );
  const mobile = [...affected].some((dir) => MOBILE_DIRS.includes(dir));
  return {
    version: 1,
    uncertain: false,
    reason,
    affected: workspaces,
    test: {
      run:
        files.length === 0 || files.some((file) => !isShardDocumentation(file)),
      reason:
        files.every(isShardDocumentation) && files.length
          ? 'documentation-only diff'
          : reason,
      workspaces,
    },
    typecheck: {
      run: typecheckWorkspaces.length > 0,
      reason:
        typecheckWorkspaces.length > 0
          ? reason
          : 'no TypeScript workspace is affected',
      ...filters,
      workspaces: typecheckWorkspaces,
    },
    lint: {
      run: files.some((file) => !LINT_IGNORED.test(file)),
      reason,
    },
    build: {
      run: buildApps.length > 0,
      apps: buildApps,
      reason: buildApps.length ? reason : 'no programming app is affected',
    },
    mobile: {
      run: mobile,
      reason: mobile ? reason : 'mobile closure is unaffected',
    },
    docs: {
      run: docs,
      reason: docs
        ? reason
        : 'no docs, public route, or package manifest changed',
    },
    cloudflare: { run: cloudflareRun, skip: cloudflareSkip, reason },
    vercel: {
      owner: 'vercel-production.yaml',
      reason:
        'Production Deployment Planner selects Vercel deploys for this diff',
    },
  };
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1 << 28,
  });
}

export function diffFiles(cwd, base, head) {
  return git(cwd, [
    'diff',
    '--name-only',
    '--no-renames',
    '-z',
    `${base}..${head}`,
  ])
    .split('\0')
    .filter(Boolean);
}

function graphAt(cwd, ref) {
  const loaded = loadGraph(cwd, ref);
  const names = new Map();
  for (const dir of loaded.dirs) {
    const manifest = `${dir}/package.json`;
    try {
      const pkg = JSON.parse(git(cwd, ['show', `${ref}:${manifest}`]));
      if (pkg.name) names.set(dir, pkg.name);
    } catch {
      /* package-less workspaces have no turbo name */
    }
  }
  return { ...loaded, names };
}

export function planFromGit({
  cwd = process.cwd(),
  base,
  head = 'HEAD',
  extraEdges,
  ownership,
}) {
  try {
    if (!base) return openPlan('diff base is missing', ownership ?? {});
    const files = diffFiles(cwd, base, head);
    const headGraph = graphAt(cwd, head);
    const edges = extraEdges ?? loadExtraEdges();
    return buildPlan({
      files,
      graph: headGraph,
      extraEdges: edges,
      ownership: ownership ?? loadOwnership(cwd),
    });
  } catch (error) {
    return openPlan(
      `plan error: ${String(error?.message ?? error)
        .split('\n')[0]
        .slice(0, 160)}`,
      ownership ?? {}
    );
  }
}

export function loadOwnership(cwd = process.cwd()) {
  try {
    return JSON.parse(
      readFileSync(path.join(cwd, 'scripts/ci/ci-plan-catalog.json'), 'utf8')
    );
  } catch {
    return {};
  }
}

export function affectedResult(plan) {
  if (!plan || plan.uncertain || plan.version !== 1)
    return {
      mode: 'all',
      apps: [],
      reason: plan?.reason ?? 'uncertain plan',
    };
  return {
    mode: 'affected',
    apps: [...plan.affected].filter((dir) => dir.startsWith('apps/')).sort(),
    reason: plan.reason,
  };
}

const SHA = /^[0-9a-f]{40}$/u;

export function resolveBase(env, cwd) {
  const eventName = env.EVENT_NAME ?? '';
  if (eventName === 'workflow_dispatch' || eventName === 'schedule')
    return { uncertain: true, reason: 'manual or scheduled run' };
  if (eventName === 'pull_request') {
    const baseRef = env.BASE_REF ?? '';
    if (!baseRef) return { uncertain: true, reason: 'base ref missing' };
    execFileSync(
      'git',
      [
        '-C',
        cwd,
        'fetch',
        '--no-tags',
        '--quiet',
        'origin',
        `${baseRef}:refs/remotes/origin/${baseRef}`,
      ],
      { stdio: 'ignore', timeout: 120_000 }
    );
    return { base: `origin/${baseRef}` };
  }
  if (eventName === 'merge_group') {
    const base = env.QUEUE_BASE_SHA ?? '';
    if (!SHA.test(base))
      return { uncertain: true, reason: 'merge group base is missing' };
    return { base };
  }
  if (eventName === 'push') {
    const before = env.BEFORE_SHA ?? '';
    if (!SHA.test(before) || /^0+$/u.test(before))
      return { uncertain: true, reason: 'push base is missing' };
    return { base: before };
  }
  return {
    uncertain: true,
    reason: `unsupported event ${eventName || 'unknown'}`,
  };
}

export function planFromEnv(env = process.env, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const ownership = options.ownership ?? loadOwnership(cwd);
  try {
    const resolved = resolveBase(env, cwd);
    if (resolved.uncertain) return openPlan(resolved.reason, ownership);
    return planFromGit({
      cwd,
      base: resolved.base,
      head: env.HEAD_SHA || 'HEAD',
      extraEdges: options.extraEdges,
      ownership,
    });
  } catch (error) {
    return openPlan(
      `plan error: ${String(error?.message ?? error)
        .split('\n')[0]
        .slice(0, 160)}`,
      ownership
    );
  }
}

export function selectorOutput(plan, selector, env = process.env) {
  const entry = plan?.[selector];
  const selected =
    !entry || plan.uncertain
      ? {
          run: true,
          reason: plan?.reason ?? 'uncertain plan',
          filters: FULL_TYPECHECK_FILTER,
          narrow: false,
          apps:
            selector === 'build'
              ? [...BUILD_APPS]
              : (plan?.cloudflare?.run ?? []),
        }
      : {
          run: entry.run !== false,
          reason: entry.reason ?? plan.reason,
          filters: entry.filters ?? FULL_TYPECHECK_FILTER,
          narrow: entry.narrow === true,
          apps: entry.apps ?? entry.run ?? [],
        };
  // A green narrowed main run is release evidence for the whole tree.
  // Main pushes stay on the full filter.
  if (
    selector === 'typecheck' &&
    env.EVENT_NAME === 'push' &&
    env.REF === 'refs/heads/main'
  ) {
    return {
      ...selected,
      run: true,
      narrow: false,
      filters: FULL_TYPECHECK_FILTER,
      reason: 'main pushes type-check the full tree',
    };
  }
  return selected;
}

function writeOutput(plan, selector) {
  const selected = selectorOutput(plan, selector);
  const line = (key, value) =>
    `${key}=${String(value).replace(/[\r\n]+/gu, ' ')}`;
  const apps = JSON.stringify(selected.apps);
  const body = [
    line('run', selected.run),
    line('reason', selected.reason),
    line('filters', selected.filters),
    line('narrow', selected.narrow),
    line('uncertain', plan.uncertain),
    line('apps', apps),
    line('mode', plan.uncertain ? 'all' : 'affected'),
    '',
  ].join('\n');
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, body);
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--affected-result')) {
    process.stdout.write(`${JSON.stringify(affectedResult(planFromEnv()))}\n`);
  } else {
    writeOutput(planFromEnv(), process.env.SELECTOR || 'typecheck');
  }
}
