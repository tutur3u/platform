// App-relevant CI evidence for a release. A repository-wide workflow (Type
// Check, Test, Oxc) checks the whole tree whenever it executes, so a green run
// on an earlier main commit stands in for the exact source when every file the
// app depends on is byte-identical between the two commits. That covers the
// app's workspace closure, files the closure imports by relative path, root
// configuration, shared actions, patches and the checking workflow. Red or
// superseded runs caused only by other apps then do not block the release,
// while any relevant change still requires the exact commit's run.
import { posix } from 'node:path';

const SHA = /^[a-f0-9]{40}$/;
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
// The equivalent commit must sit within this many commits of the source.
export const MAX_EQUIVALENT_DISTANCE = 200;
// At most this many recent green runs are compared against the source.
export const MAX_EQUIVALENT_CANDIDATES = 20;

function stop(code) {
  throw Object.assign(new Error(code), { guardCode: code });
}

// manifests: Map of workspace directory -> parsed package.json.
export function workspaceClosure(appDir, manifests) {
  if (!manifests.has(appDir)) stop('RELEASE_CI_APP_MANIFEST');
  const byName = new Map();
  for (const [dir, manifest] of manifests) {
    if (typeof manifest?.name === 'string') byName.set(manifest.name, dir);
  }
  const closure = new Set([appDir]);
  const queue = [appDir];
  while (queue.length > 0) {
    const manifest = manifests.get(queue.shift());
    for (const field of DEPENDENCY_FIELDS) {
      for (const name of Object.keys(manifest?.[field] ?? {})) {
        const dir = byName.get(name);
        if (dir && !closure.has(dir)) {
          closure.add(dir);
          queue.push(dir);
        }
      }
    }
  }
  return [...closure].sort();
}

export function readWorkspaceManifests(git, sha) {
  if (!SHA.test(sha ?? '')) stop('RELEASE_CI_SOURCE');
  const manifests = new Map();
  const dirs = git(['ls-tree', '--name-only', sha, 'apps/', 'packages/'])
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(?:apps|packages)\/[^/]+$/.test(line));
  for (const dir of dirs) {
    let text;
    try {
      text = git(['show', `${sha}:${dir}/package.json`]);
    } catch {
      continue;
    }
    try {
      manifests.set(dir, JSON.parse(text));
    } catch {
      stop('RELEASE_CI_MANIFEST_UNREADABLE');
    }
  }
  return manifests;
}

const inside = (file, dir) => file === dir || file.startsWith(`${dir}/`);

// Repository paths outside the closure that closure files reference by a
// relative specifier (imports, requires, tsconfig and script paths). Comments
// count too, which only widens the relevant set. Prose files, installed
// packages and the bare apps/ or packages/ containers (repository-wide content
// tests) are not code the app runs.
export function externalReferences(git, sha, closure) {
  let output;
  try {
    output = git([
      'grep',
      '-I',
      '-o',
      '-E',
      '-e',
      '(\\.\\./)+[A-Za-z0-9_@.][A-Za-z0-9_@./-]*',
      sha,
      '--',
      ...closure,
    ]);
  } catch (error) {
    // git grep exits 1 when nothing matches.
    if (error.status === 1) return [];
    throw error;
  }
  const references = new Set();
  for (const line of output.split('\n')) {
    if (!line.startsWith(`${sha}:`)) continue;
    const rest = line.slice(sha.length + 1);
    const split = rest.indexOf(':');
    if (split <= 0) continue;
    const file = rest.slice(0, split);
    if (/\.mdx?$/.test(file)) continue;
    const target = posix
      .normalize(posix.join(posix.dirname(file), rest.slice(split + 1)))
      .replace(/\/+$/, '');
    if (
      !target ||
      target === '.' ||
      target === 'apps' ||
      target === 'packages' ||
      target.startsWith('../') ||
      target.split('/').includes('node_modules')
    )
      continue;
    if (closure.some((dir) => inside(target, dir))) continue;
    references.add(target);
  }
  return [...references].sort();
}

// Root files (lockfile, tsconfig, turbo, lint config), shared actions, the
// checking workflow itself and dependency patches affect every app's result.
// A reference without an extension also matches its resolved files.
export function touchesRelevant(files, closure, workflow, references = []) {
  return files.some(
    (file) =>
      !file.includes('/') ||
      file.startsWith('.github/actions/') ||
      file === `.github/workflows/${workflow}` ||
      file.startsWith('patches/') ||
      closure.some((dir) => inside(file, dir)) ||
      references.some(
        (reference) =>
          inside(file, reference) || file.startsWith(`${reference}.`)
      )
  );
}

// A green run only proves the tree when its checks executed: release-only
// and docs-only pushes skip the heavy work yet still conclude success. The
// candidate run's own jobs are the evidence, read for the exact attempt.
const executionEvidence = {
  'type-check.yaml': (jobs) =>
    jobs.some(
      (job) =>
        job.name === 'Type Check' &&
        job.conclusion === 'success' &&
        job.steps?.some(
          (step) =>
            step.name === 'Run type check' && step.conclusion === 'success'
        )
    ),
  'turbo-unit-tests.yaml': (jobs) =>
    [
      'Root script tests (24)',
      ...[0, 1, 2, 3].map((n) => `Unit test shard (${n})`),
    ].every((name) =>
      jobs.some((job) => job.name === name && job.conclusion === 'success')
    ),
  'oxc-check.yaml': (jobs) =>
    ['Oxlint Lint Check', 'Oxfmt Format Check'].every((name) =>
      jobs.some((job) => job.name === name && job.conclusion === 'success')
    ),
};

export const EQUIVALENT_WORKFLOWS = Object.keys(executionEvidence);

export function runExecuted(workflow, payload) {
  const evidence = executionEvidence[workflow];
  if (!evidence) stop('RELEASE_CI_WORKFLOW');
  if (!Array.isArray(payload?.jobs)) stop('RELEASE_CI_RESPONSE');
  return evidence(payload.jobs);
}

function sameRepository(run) {
  return (
    run?.repository?.full_name === 'tutur3u/platform' &&
    run?.head_repository?.full_name === 'tutur3u/platform' &&
    run?.head_branch === 'main' &&
    ['push', 'workflow_dispatch'].includes(run?.event)
  );
}

// Green runs on main other than the source and the current run, newest first,
// one per commit.
export function equivalentCandidates(payload, source, currentRun) {
  if (!Array.isArray(payload?.workflow_runs)) stop('RELEASE_CI_RESPONSE');
  const seen = new Set();
  const candidates = [];
  const runs = [...payload.workflow_runs].sort(
    (a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt
  );
  for (const run of runs) {
    const sha = run?.head_sha;
    if (
      !SHA.test(sha ?? '') ||
      sha === source ||
      seen.has(sha) ||
      String(run.id) === String(currentRun) ||
      !sameRepository(run) ||
      run.status !== 'completed' ||
      run.conclusion !== 'success'
    )
      continue;
    seen.add(sha);
    candidates.push(sha);
    if (candidates.length >= MAX_EQUIVALENT_CANDIDATES) break;
  }
  return candidates;
}

// Ancestors of the source within reach whose diff with the source leaves
// every relevant path untouched, nearest first. Descendants never qualify. The
// caller still proves that each candidate's green run executed (runExecuted).
export function equivalentAncestors({
  candidates,
  closure,
  git,
  references = [],
  source,
  workflow,
}) {
  const isAncestor = (older, newer) => {
    try {
      git(['merge-base', '--is-ancestor', older, newer]);
      return true;
    } catch (error) {
      if (error.status === 1) return false;
      throw error;
    }
  };
  const names = (args) =>
    git(args)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  const qualified = [];
  for (const sha of candidates) {
    if (!isAncestor(sha, source)) continue;
    const distance = Number(git(['rev-list', '--count', `${sha}..${source}`]));
    if (!Number.isSafeInteger(distance) || distance > MAX_EQUIVALENT_DISTANCE)
      continue;
    const changed = names(['diff', '--name-only', '--no-renames', sha, source]);
    if (touchesRelevant(changed, closure, workflow, references)) continue;
    qualified.push({ sha, distance });
  }
  return qualified.sort((a, b) => a.distance - b.distance);
}
