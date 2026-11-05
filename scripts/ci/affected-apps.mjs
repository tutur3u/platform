// Affected-apps calculator: `node scripts/ci/affected-apps.mjs --base <ref> [--head HEAD]`.
//
// Design notes
// - Graph: every folder under apps/ and packages/ is a unit. Edges come from package.json
//   dependencies, devDependencies, peerDependencies and optionalDependencies.
// - Folders WITHOUT a package.json (apps/backend, apps/chat-realtime, apps/discord, apps/docs, ...) are
//   standalone units: affected only when a file under them changes (or via an extra edge below). They
//   never force mode "all". Output names are workspace dirs, e.g. {"mode":"affected","apps":["apps/docs"]}.
// - Undeclared cross-workspace relative imports (e.g. `../../../packages/utils/src/x` from
//   apps/coordination) are invisible to package.json, so they are listed in
//   affected-apps.extra-edges.json: { "<changed path prefix>/": ["<dependent workspace dir>", ...] }.
//   affected-apps.test.mjs scans the repo and FAILS when a new undeclared import is not covered; add the
//   suggested entry printed by `node scripts/ci/affected-apps-imports.mjs`. Test-only importers (specs,
//   e2e, fixtures, vitest/playwright configs) are deliberately not edges, see affected-apps-imports.mjs.
// - Renames are diffed with --no-renames so both the moved-from and moved-to paths count.
// - Anything unexpected (bad ref, unreadable graph, root/CI/config files) fails safe to mode "all".

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const runGit = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const EXTRA_EDGES_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'affected-apps.extra-edges.json');

export function verdict({ mode, apps, codeChanged, results }) {
  if (mode === 'affected' && codeChanged && apps.length === 0) return { pass: false, reason: 'code changed but no apps were selected' };
  const failed = apps.find((app) => results[app] !== 'success');
  if (failed) return { pass: false, reason: `${failed} result was ${results[failed] ?? 'missing'}` };
  return { pass: true, reason: 'all listed apps succeeded' };
}

function failSafePath(file) {
  return file === 'bun.lock' || file === 'package.json' || file === 'turbo.json' ||
    file.startsWith('.github/') || /^tsconfig[^/]*$/.test(file) || /^(biome|eslint)[^/]*$/.test(file) ||
    /(^|\/)Dockerfile[^/]*$/.test(file) || file.startsWith('.env') || /\.env\.example$/.test(file) ||
    /(^|\/)[^/]*\.env\.example$/.test(file) || file.startsWith('scripts/');
}

function workspaceDirs(root, group) {
  const base = path.join(root, group);
  if (!statSync(base, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => `${group}/${entry.name}`);
}

// Source path prefix -> workspace dirs that import it by relative path without declaring a dependency.
// Missing or malformed file throws: the caller fails safe to mode "all".
export function loadExtraEdges(file = EXTRA_EDGES_PATH) {
  const edges = JSON.parse(readFileSync(file, 'utf8'));
  if (!edges || typeof edges !== 'object' || Array.isArray(edges)) throw new Error(`${file} must be an object`);
  for (const [prefix, dependents] of Object.entries(edges)) {
    if (!Array.isArray(dependents) || dependents.some((dep) => typeof dep !== 'string')) throw new Error(`${file}: "${prefix}" must map to an array of workspace dirs`);
  }
  return edges;
}

export function coveredByExtraEdges(extraEdges, file, dependent) {
  return Object.entries(extraEdges).some(([prefix, dependents]) => file.startsWith(prefix) && dependents.includes(dependent));
}

// Workspace graph. Every folder under apps/ and packages/ is a unit; folders without a package.json
// (apps/backend, apps/docs, ...) are standalone units with no declared dependencies, affected only by
// changes under them (plus extra edges) and by changes in anything listed in extra-edges.
export function loadGraph(cwd) {
  const dirs = [...workspaceDirs(cwd, 'apps'), ...workspaceDirs(cwd, 'packages')];
  const byName = new Map();
  const dependencies = new Map();
  for (const dir of dirs) {
    const manifest = path.join(cwd, dir, 'package.json');
    if (!existsSync(manifest)) { dependencies.set(dir, []); continue; }
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    if (!pkg.name) throw new Error(`workspace missing name: ${dir}`);
    byName.set(pkg.name, dir);
    dependencies.set(dir, Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies }));
  }
  const dependents = new Map(dirs.map((dir) => [dir, new Set()]));
  for (const [dir, deps] of dependencies) for (const dep of deps) {
    const target = byName.get(dep);
    if (target) dependents.get(target).add(dir);
  }
  const declares = (dependent, dependency) => (dependencies.get(dependent) ?? []).some((name) => byName.get(name) === dependency);
  return { dirs, dependents, declares };
}

export function calculate({ base, head = 'HEAD', cwd = process.cwd(), extraEdges }) {
  try {
    const mergeBase = runGit('-C', cwd, 'merge-base', base, head);
    if (!mergeBase) return { mode: 'all', apps: [], reason: 'merge-base could not be resolved' };
    // --no-renames reports a rename as a delete of the old path plus an add of the new one, so the
    // moved-from workspace is never hidden. -z avoids path quoting.
    const files = execFileSync('git', ['-C', cwd, 'diff', '--name-only', '--no-renames', '-z', `${mergeBase}..${head}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }).split('\0').filter(Boolean);
    if (files.some(failSafePath)) return { mode: 'all', apps: [], reason: 'changed path requires all apps' };

    const edges = extraEdges ?? loadExtraEdges();
    const { dirs, dependents } = loadGraph(cwd);
    for (const [prefix, list] of Object.entries(edges)) for (const dep of list) {
      if (!dirs.includes(dep)) throw new Error(`extra edge "${prefix}" names unknown workspace ${dep}`);
    }

    const owners = (file) => dirs.filter((dir) => file.startsWith(`${dir}/`)).sort((a, b) => b.length - a.length)[0];
    const seeds = new Set();
    for (const file of files) {
      const owner = owners(file);
      if (owner) seeds.add(owner);
      else if (!(file.endsWith('.md') || file.startsWith('docs/'))) return { mode: 'all', apps: [], reason: `changed file outside workspace: ${file}` };
      for (const [prefix, list] of Object.entries(edges)) if (file.startsWith(prefix)) for (const dep of list) seeds.add(dep);
    }
    const affected = new Set(seeds);
    const queue = [...seeds];
    while (queue.length) for (const dependent of dependents.get(queue.shift()) ?? []) if (!affected.has(dependent)) {
      affected.add(dependent); queue.push(dependent);
    }
    return { mode: 'affected', apps: [...affected].filter((dir) => dir.startsWith('apps/')).sort(), reason: files.length ? 'workspace and documentation changes' : 'no changed files' };
  } catch (error) {
    return { mode: 'all', apps: [], reason: `error: ${error.message}` };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const baseIndex = args.indexOf('--base');
  const headIndex = args.indexOf('--head');
  if (baseIndex < 0 || !args[baseIndex + 1]) {
    console.log(JSON.stringify({ mode: 'all', apps: [], reason: 'usage: --base <ref> [--head HEAD]' }));
  } else {
    console.log(JSON.stringify(calculate({ base: args[baseIndex + 1], head: headIndex >= 0 ? args[headIndex + 1] : 'HEAD' })));
  }
}
