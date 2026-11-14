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
//   suggested entry printed by `node scripts/ci/affected-apps-imports.mjs`. Test importers count: a
//   per-app test job is gated, so a test file that imports another workspace is an edge.
// - Renames are diffed with --no-renames so both the moved-from and moved-to paths count.
// - Anything unexpected (bad ref, unreadable graph, root/CI/config files) fails safe to mode "all".

import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const runGit = (...args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const EXTRA_EDGES_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'affected-apps.extra-edges.json'
);

// In mode "all", `apps` must be the full list the caller built; every listed app must succeed, so
// results covering only a subset of apps cannot pass.
export function verdict({ mode, apps, codeChanged, results }) {
  if (mode === 'all') {
    if (apps.length === 0)
      return { pass: false, reason: 'fail-safe all needs the full app list' };
    const bad = Object.entries(results).find(
      ([, result]) => result !== 'success'
    );
    if (bad) return { pass: false, reason: `${bad[0]} result was ${bad[1]}` };
  }
  if (mode === 'affected' && codeChanged && apps.length === 0)
    return { pass: false, reason: 'code changed but no apps were selected' };
  const failed = apps.find((app) => results[app] !== 'success');
  if (failed)
    return {
      pass: false,
      reason: `${failed} result was ${results[failed] ?? 'missing'}`,
    };
  return { pass: true, reason: 'all listed apps succeeded' };
}

function failSafePath(file) {
  return (
    /(^|\/)(AGENTS\.md|CLAUDE\.md|CODEOWNERS)$/.test(file) ||
    /^(plugins|tooling|\.agents|\.codex|\.claude)\//.test(file) ||
    file === 'bun.lock' ||
    file === 'package.json' ||
    file === 'turbo.json' ||
    file.startsWith('.github/') ||
    /(^|\/)tsconfig[^/]*$/.test(file) ||
    /^(\.oxfmtrc|\.oxlintrc|eslint)[^/]*$/.test(file) ||
    /(^|\/)Dockerfile[^/]*$/.test(file) ||
    file.startsWith('.env') ||
    /\.env\.example$/.test(file) ||
    /(^|\/)[^/]*\.env\.example$/.test(file) ||
    file.startsWith('scripts/')
  );
}

function workspaceDirs(root, group, ref) {
  if (ref) {
    // Read the tree rather than the working copy: CI gate jobs use a sparse checkout that only
    // materializes package.json files, so package.json-less folders would otherwise be invisible.
    const out = execFileSync(
      'git',
      ['-C', root, 'ls-tree', '-d', '--name-only', '-z', ref, `${group}/`],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 1 << 24,
      }
    );
    return out
      .split('\0')
      .filter((dir) => dir && !path.posix.basename(dir).startsWith('.'));
  }
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
  if (!edges || typeof edges !== 'object' || Array.isArray(edges))
    throw new Error(`${file} must be an object`);
  for (const [prefix, dependents] of Object.entries(edges)) {
    if (
      !Array.isArray(dependents) ||
      dependents.some((dep) => typeof dep !== 'string')
    )
      throw new Error(
        `${file}: "${prefix}" must map to an array of workspace dirs`
      );
  }
  return edges;
}

const matchesPrefix = (file, prefix) =>
  file.startsWith(prefix) ||
  (prefix.endsWith('/') && file === prefix.slice(0, -1));

export function coveredByExtraEdges(extraEdges, file, dependent) {
  return Object.entries(extraEdges).some(
    ([prefix, dependents]) =>
      matchesPrefix(file, prefix) && dependents.includes(dependent)
  );
}

// Workspace graph. Every folder under apps/ and packages/ is a unit; folders without a package.json
// (apps/backend, apps/docs, ...) are standalone units with no declared dependencies, affected only by
// changes under them (plus extra edges) and by changes in anything listed in extra-edges.
// With a ref, folders and manifests both come from that commit's tree, so --head never mixes the
// working copy with another commit.
export function loadGraph(cwd, ref) {
  if (ref) return loadGraphAtTree(cwd, ref);
  const dirs = [
    ...workspaceDirs(cwd, 'apps', ref),
    ...workspaceDirs(cwd, 'packages', ref),
  ];
  const byName = new Map();
  const dependencies = new Map();
  for (const dir of dirs) {
    const manifest = path.join(cwd, dir, 'package.json');
    if (!existsSync(manifest)) {
      dependencies.set(dir, []);
      continue;
    }
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    if (!pkg.name) throw new Error(`workspace missing name: ${dir}`);
    if (byName.has(pkg.name)) throw new Error('duplicate workspace name');
    byName.set(pkg.name, dir);
    dependencies.set(
      dir,
      Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
        ...pkg.optionalDependencies,
      })
    );
  }
  const dependents = new Map(dirs.map((dir) => [dir, new Set()]));
  for (const [dir, deps] of dependencies)
    for (const dep of deps) {
      const target = byName.get(dep);
      if (target) dependents.get(target).add(dir);
    }
  const declares = (dependent, dependency) =>
    (dependencies.get(dependent) ?? []).some(
      (name) => byName.get(name) === dependency
    );
  return { dirs, dependents, declares };
}

function loadGraphAtTree(cwd, ref) {
  const out = execFileSync(
    'git',
    ['-C', cwd, 'ls-tree', '-r', '--name-only', ref, '--', 'apps', 'packages'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 24 }
  );
  const manifests = new Set(
    out
      .split('\n')
      .filter((file) => /^(apps|packages)\/[^/]+\/package\.json$/.test(file))
  );
  const dirs = [
    ...workspaceDirs(cwd, 'apps', ref),
    ...workspaceDirs(cwd, 'packages', ref),
  ];
  const names = new Map();
  const dependencies = new Map();
  for (const dir of dirs) {
    const file = `${dir}/package.json`;
    if (!manifests.has(file)) {
      dependencies.set(dir, []);
      continue;
    }
    const pkg = JSON.parse(
      execFileSync('git', ['-C', cwd, 'show', `${ref}:${file}`], {
        encoding: 'utf8',
      })
    );
    if (!pkg.name) throw new Error(`workspace missing name: ${dir}`);
    if (names.has(pkg.name)) throw new Error('duplicate workspace name');
    names.set(pkg.name, dir);
    dependencies.set(
      dir,
      Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
        ...pkg.optionalDependencies,
      })
    );
  }
  const dependents = new Map(dirs.map((dir) => [dir, new Set()]));
  for (const [dir, deps] of dependencies)
    for (const dep of deps) {
      const target = names.get(dep);
      if (target) dependents.get(target).add(dir);
    }
  const declares = (dependent, dependency) =>
    (dependencies.get(dependent) ?? []).some(
      (name) => names.get(name) === dependency
    );
  return { dirs, dependents, declares };
}

const DOC_EXTENSIONS = new Set(['.md', '.mdx']);
const isDocumentation = (file) =>
  DOC_EXTENSIONS.has(path.posix.extname(file).toLowerCase()) &&
  (file.startsWith('docs/') ||
    file.startsWith('apps/docs/') ||
    /^(README|CONTRIBUTING|LICENSE|CHANGELOG)\.md$/.test(file));

export function calculate({
  base,
  head = 'HEAD',
  cwd = process.cwd(),
  extraEdges,
  skipDocumentation = false,
}) {
  try {
    if (
      ![base, head].every(
        (ref) => typeof ref === 'string' && /^(?!-)[a-zA-Z0-9_./-]+$/.test(ref)
      )
    )
      throw new Error('invalid ref');
    const mergeBases = runGit(
      '-C',
      cwd,
      'merge-base',
      '--all',
      base,
      head
    ).split(/\r?\n/);
    if (mergeBases.length !== 1 || !/^[0-9a-f]{40}$/.test(mergeBases[0]))
      return {
        mode: 'all',
        apps: [],
        reason: 'merge-base must resolve to exactly one full SHA',
      };
    const [mergeBase] = mergeBases;
    // --no-renames reports a rename as a delete of the old path plus an add of the new one, so the
    // moved-from workspace is never hidden. -z avoids path quoting.
    const files = execFileSync(
      'git',
      [
        '-C',
        cwd,
        'diff',
        '--name-only',
        '--no-renames',
        '-z',
        `${mergeBase}..${head}`,
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 1 << 28,
      }
    )
      .split('\0')
      .filter(Boolean);
    if (files.some(failSafePath))
      return {
        mode: 'all',
        apps: [],
        reason: 'changed path requires all apps',
      };

    let edges = extraEdges;
    if (!edges) {
      const file = 'scripts/ci/affected-apps.extra-edges.json';
      const atBase = runGit('-C', cwd, 'show', `${base}:${file}`);
      const atAncestor = runGit('-C', cwd, 'show', `${mergeBase}:${file}`);
      const atHead = runGit('-C', cwd, 'show', `${head}:${file}`);
      if (atBase !== atHead || atAncestor !== atHead)
        throw new Error('extra edges changed');
      edges = JSON.parse(atHead);
      if (!edges || typeof edges !== 'object' || Array.isArray(edges))
        throw new Error('invalid extra edges');
      for (const list of Object.values(edges))
        if (!Array.isArray(list) || list.some((dep) => typeof dep !== 'string'))
          throw new Error('invalid extra edge');
    }
    const headGraph = loadGraph(cwd, head);
    const baseGraph = loadGraphAtTree(cwd, base);
    const ancestorGraph = loadGraphAtTree(cwd, mergeBase);
    const dirs = [
      ...new Set([...headGraph.dirs, ...baseGraph.dirs, ...ancestorGraph.dirs]),
    ];
    const dependents = new Map(
      dirs.map((dir) => [
        dir,
        new Set([
          ...(headGraph.dependents.get(dir) ?? []),
          ...(baseGraph.dependents.get(dir) ?? []),
          ...(ancestorGraph.dependents.get(dir) ?? []),
        ]),
      ])
    );
    for (const [prefix, list] of Object.entries(edges))
      for (const dep of list) {
        if (!dirs.includes(dep))
          throw new Error(
            `extra edge "${prefix}" names unknown workspace ${dep}`
          );
      }

    const owners = (file) =>
      dirs
        .filter((dir) => file.startsWith(`${dir}/`))
        .sort((a, b) => b.length - a.length)[0];
    const seeds = new Set();
    for (const file of files) {
      if (skipDocumentation && isDocumentation(file)) continue;
      const owner = owners(file);
      if (owner) seeds.add(owner);
      else if (!isDocumentation(file))
        return {
          mode: 'all',
          apps: [],
          reason: `changed file outside workspace: ${file}`,
        };
      for (const [prefix, list] of Object.entries(edges))
        if (matchesPrefix(file, prefix)) for (const dep of list) seeds.add(dep);
    }
    const affected = new Set(seeds);
    const queue = [...seeds];
    while (queue.length)
      for (const dependent of dependents.get(queue.shift()) ?? [])
        if (!affected.has(dependent)) {
          affected.add(dependent);
          queue.push(dependent);
        }
    return {
      mode: 'affected',
      apps: [...affected].filter((dir) => dir.startsWith('apps/')).sort(),
      packages: [...affected]
        .filter((dir) => dir.startsWith('packages/'))
        .sort(),
      workspaces: [...affected].sort(),
      reason: files.length
        ? 'workspace and documentation changes'
        : 'no changed files',
    };
  } catch (error) {
    return { mode: 'all', apps: [], reason: `error: ${error.message}` };
  }
}

export function selectPullRequest({ eventName, event, cwd = process.cwd() }) {
  const full = { mode: 'all', apps: [], reason: 'full validation' };
  if (eventName !== 'pull_request') return full;
  const base = event?.pull_request?.base?.sha;
  const head = event?.pull_request?.head?.sha;
  if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? '')))
    return full;
  return calculate({ base, head, cwd, skipDocumentation: true });
}

export function typeCheckArgs(selection) {
  const filters =
    selection.mode === 'affected'
      ? selection.workspaces.map((dir) => {
          if (!/^(apps|packages)\/[a-zA-Z0-9_-]+$/.test(dir))
            throw new Error('invalid workspace');
          return `--filter=./${dir}...`;
        })
      : [];
  return [
    'turbo:local',
    'run',
    'type-check',
    '--concurrency=4',
    ...filters,
    '--filter=!@tuturuuu/tanstack-web',
  ];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--ci', '--type-check'].includes(args[0])) {
    let selection = { mode: 'all', apps: [], reason: 'unreadable event' };
    try {
      selection = selectPullRequest({
        eventName: process.env.GITHUB_EVENT_NAME,
        event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
      });
    } catch {}
    if (selection.mode === 'affected' && selection.workspaces.length) {
      try {
        const { scanCrossWorkspaceImports, undeclaredImports } =
          await import('./affected-apps-imports.mjs');
        const edges = loadExtraEdges();
        const missing = undeclaredImports(
          scanCrossWorkspaceImports(process.cwd()),
          loadGraph(process.cwd()).declares
        ).filter(
          ({ importer, target }) =>
            !coveredByExtraEdges(edges, target, importer)
        );
        if (missing.length) throw new Error('uncovered cross-workspace import');
      } catch (error) {
        selection = {
          mode: 'all',
          apps: [],
          reason: `graph guard: ${error.message}`,
        };
      }
    }
    const selected =
      selection.mode !== 'affected' || selection.workspaces.length > 0;
    if (args[0] === '--type-check') {
      if (selected) {
        const { spawnSync } = await import('node:child_process');
        const result = spawnSync('bun', typeCheckArgs(selection), {
          stdio: 'inherit',
        });
        if (result.error) throw result.error;
        process.exitCode = result.status ?? 1;
      } else
        console.log('Type Check not applicable; no compilation performed.');
    } else {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `selection=${JSON.stringify(selection)}\napplicable=${selected}\n`
      );
    }
  } else if (
    (args.length === 2 && args[0] === '--base') ||
    (args.length === 4 && args[0] === '--base' && args[2] === '--head')
  ) {
    console.log(
      JSON.stringify(calculate({ base: args[1], head: args[3] ?? 'HEAD' }))
    );
  } else
    console.log(
      JSON.stringify({ mode: 'all', apps: [], reason: 'invalid options' })
    );
}
