#!/usr/bin/env node
// Diff-scoped CodeQL scope for a push to main. The range starts at the newest
// main commit whose push scan succeeded (an ancestor of the pushed tip), so a
// pending run replaced by a newer push is still covered by the next scan. The
// JavaScript/TypeScript scan extracts the workspaces that range touched,
// including deletions, plus the direct dependents of every touched package
// while the total stays within the scoped ceiling, so a changed helper is
// analyzed with its callers. Python and Actions scans stay
// whole-language because they finish in about two minutes. Any missing
// evidence (unreadable scan history, no scanned ancestor, an oversized range or
// an unsafe path) selects the full scan. The nightly full scan in
// security-checks.yaml remains the uploaded code-scanning baseline.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const { classifyScope } = require('./security-paths.js');

const SHA = /^[0-9a-f]{40}$/u;
// Beyond this many commits the diff is too broad to be worth scoping.
const maxRangeCommits = 400;
// Workspaces listed beyond this cost about as much as a full extraction.
const maxScopedRoots = 30;
const safeSegment = /^(?!\.{1,2}$)[A-Za-z0-9@._][A-Za-z0-9._@-]*$/u;
const javascriptLanguage = 'javascript-typescript';
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

// The scan unit for a changed JavaScript/TypeScript file: its apps/* or
// packages/* workspace, its top-level directory elsewhere, or the file itself
// at the repository root. Only the segments that form the unit reach CodeQL's
// paths filter, so deeper segments such as Next.js `[id]` or `(group)` route
// directories are fine. Returns null when the unit itself is unsafe.
function scanRoot(filePath) {
  const segments = String(filePath).split('/');
  const workspace =
    (segments[0] === 'apps' || segments[0] === 'packages') &&
    segments.length > 2;
  const unit = segments.slice(0, workspace ? 2 : 1);
  if (unit.some((segment) => !safeSegment.test(segment))) return null;
  return unit.join('/');
}

// Workspaces that declare a direct dependency on a touched package.
// manifests: Map of workspace directory -> parsed package.json.
function directDependents(roots, manifests) {
  const touchedNames = new Set();
  for (const root of roots) {
    const name = manifests.get(root)?.name;
    if (root.startsWith('packages/') && typeof name === 'string')
      touchedNames.add(name);
  }
  const dependents = new Set();
  if (touchedNames.size === 0) return dependents;
  for (const [dir, manifest] of manifests) {
    if (roots.has(dir)) continue;
    const declared = dependencyFields.flatMap((field) =>
      Object.keys(manifest?.[field] ?? {})
    );
    if (declared.some((name) => touchedNames.has(name))) dependents.add(dir);
  }
  return dependents;
}

const fullScope = (reason) => ({
  full: true,
  languages: classifyScope([], { full: true }).codeqlLanguages,
  paths: [],
  reason,
});

// Selection from the changed files of a resolved range. `exists(root)` drops
// roots the head no longer has; `manifests` adds dependents of packages.
function selectScope(
  files,
  { exists = () => true, manifests = new Map() } = {}
) {
  // Paths are exact (git diff -z); trimming could turn " apps/x" into apps/x.
  const changed = (files ?? []).map(String).filter(Boolean);
  if (changed.length === 0) return fullScope('the range resolved no files');
  const { codeqlLanguages } = classifyScope(changed);
  if (!codeqlLanguages.includes(javascriptLanguage)) {
    return {
      full: false,
      languages: codeqlLanguages,
      paths: [],
      reason: 'no JavaScript or TypeScript changes',
    };
  }
  const javascript = changed.filter((file) =>
    classifyScope([file]).codeqlLanguages.includes(javascriptLanguage)
  );
  const roots = new Set();
  for (const file of javascript) {
    const root = scanRoot(file);
    if (!root)
      return fullScope(
        `unsafe path for a scoped scan: ${JSON.stringify(file)}`
      );
    roots.add(root);
  }
  if (roots.size > maxScopedRoots) {
    return fullScope(`${roots.size} workspaces changed`);
  }
  // Dependents join only while the scan stays scoped. A widely shared package
  // (utils, types, ui) has more dependents than the ceiling; its cross-workspace
  // effects then wait for the nightly full scan instead of forcing every push
  // scan to full.
  const dependents = directDependents(roots, manifests);
  const deferred = roots.size + dependents.size > maxScopedRoots;
  if (!deferred) for (const dependent of dependents) roots.add(dependent);
  const present = [...roots].filter((root) => exists(root)).sort();
  const languages =
    present.length > 0
      ? codeqlLanguages
      : codeqlLanguages.filter((language) => language !== javascriptLanguage);
  return {
    full: false,
    languages,
    paths: present,
    reason:
      present.length > 0
        ? `${present.length} workspace(s) in scope${deferred ? `; ${dependents.size} dependents deferred to the nightly scan` : ''}`
        : 'only removed JavaScript or TypeScript workspaces',
  };
}

function git(args, rootDir) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function isAncestor(older, newer, rootDir) {
  try {
    git(['merge-base', '--is-ancestor', older, newer], rootDir);
    return true;
  } catch {
    return false;
  }
}

function existsAt(sha, filePath, rootDir) {
  try {
    git(['cat-file', '-e', `${sha}:${filePath}`], rootDir);
    return true;
  } catch {
    return false;
  }
}

function readManifests(sha, rootDir) {
  const manifests = new Map();
  const dirs = git(
    ['ls-tree', '--name-only', sha, 'apps/', 'packages/'],
    rootDir
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(?:apps|packages)\/[^/]+$/u.test(line));
  for (const dir of dirs) {
    try {
      manifests.set(
        dir,
        JSON.parse(git(['show', `${sha}:${dir}/package.json`], rootDir))
      );
    } catch {
      // A directory without a readable manifest has no dependents to add.
    }
  }
  return manifests;
}

async function lastScannedAncestor({
  api,
  fetcher,
  headSha,
  repo,
  rootDir,
  token,
}) {
  const query = new URLSearchParams({
    branch: 'main',
    event: 'push',
    per_page: '50',
    status: 'success',
  });
  const response = await fetcher(
    `${api}/repos/${repo}/actions/workflows/codeql.yml/runs?${query}`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
      signal: AbortSignal.timeout(20_000),
    }
  );
  if (!response.ok)
    throw new Error(`run lookup failed with ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body?.workflow_runs))
    throw new Error('run lookup returned no run list');
  for (const run of body.workflow_runs) {
    const sha = run?.head_sha;
    if (
      !SHA.test(sha ?? '') ||
      sha === headSha ||
      run.head_branch !== 'main' ||
      run.event !== 'push' ||
      run.conclusion !== 'success' ||
      run.repository?.full_name !== repo ||
      run.head_repository?.full_name !== repo
    )
      continue;
    if (isAncestor(sha, headSha, rootDir)) return sha;
  }
  return null;
}

async function resolvePushScope({
  api = 'https://api.github.com',
  fetcher = fetch,
  headSha,
  repo,
  rootDir = process.cwd(),
  token,
} = {}) {
  if (!SHA.test(headSha ?? ''))
    return fullScope('the pushed commit is invalid');
  if (!token || !repo) return fullScope('scan history is unavailable');
  let baseSha;
  try {
    baseSha = await lastScannedAncestor({
      api: api.replace(/\/$/u, ''),
      fetcher,
      headSha,
      repo,
      rootDir,
      token,
    });
  } catch (error) {
    // A narrower fallback range could skip a replaced commit.
    return fullScope(`scan history is unavailable: ${error.message}`);
  }
  if (!baseSha) return fullScope('no scanned ancestor of the pushed commit');
  let files;
  let manifests;
  try {
    const count = Number(
      git(['rev-list', '--count', `${baseSha}..${headSha}`], rootDir).trim()
    );
    if (!Number.isSafeInteger(count) || count > maxRangeCommits) {
      return fullScope(`${count} commits since ${baseSha}`);
    }
    files = git(
      ['diff', '--name-only', '--no-renames', '-z', baseSha, headSha],
      rootDir
    )
      .split('\0')
      .filter(Boolean);
    manifests = readManifests(headSha, rootDir);
  } catch (error) {
    return fullScope(`the range is unreadable: ${error.message}`);
  }
  if (files.length === 0) {
    return {
      baseSha,
      full: false,
      languages: [],
      paths: [],
      reason: 'the range changes no files',
    };
  }
  return {
    ...selectScope(files, {
      exists: (root) => existsAt(headSha, root, rootDir),
      manifests,
    }),
    baseSha,
  };
}

function outputs(scope) {
  return [
    `codeql_languages=${JSON.stringify(scope.languages)}`,
    `codeql=${scope.languages.length > 0}`,
    `codeql_paths=${scope.full || scope.paths.length === 0 ? '' : JSON.stringify(scope.paths)}`,
  ];
}

async function main(env = process.env) {
  const scope = await resolvePushScope({
    api: env.GITHUB_API_URL,
    headSha: env.GITHUB_SHA,
    repo: env.GITHUB_REPOSITORY,
    token: env.GITHUB_TOKEN,
  });
  const summary = `CodeQL push scope: ${scope.full ? 'full' : 'diff'} from ${scope.baseSha ?? 'none'}; ${scope.reason}. Paths: ${scope.paths.join(', ') || 'all'}.`;
  console.log(summary);
  const lines = outputs(scope);
  console.log(lines.join('\n'));
  if (env.GITHUB_OUTPUT)
    fs.appendFileSync(env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  if (env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    // Fail open to the full scan rather than skipping analysis.
    console.error(`CodeQL push scope failed: ${error.message}`);
    const lines = outputs(fullScope('scope resolution failed'));
    console.log(lines.join('\n'));
    if (process.env.GITHUB_OUTPUT)
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  });
}

module.exports = {
  directDependents,
  maxRangeCommits,
  maxScopedRoots,
  outputs,
  resolvePushScope,
  scanRoot,
  selectScope,
};
