// Select type-check packages from a Turbo dry graph. The dry run is the only
// Turbo invocation check:changed makes. It must not execute a task, including
// any task whose dependsOn includes a build.

const fs = require('node:fs');
const path = require('node:path');

const REQUESTED_TASKS = new Set(['type-check', 'test']);
const SHA = /^[0-9a-f]{7,64}$/i;

function remoteCacheEnabled(env = {}) {
  const token = env.TURBO_TOKEN;
  const team = env.TURBO_TEAM;
  return (
    typeof token === 'string' &&
    token.trim() !== '' &&
    typeof team === 'string' &&
    team.trim() !== ''
  );
}

function turboDryArgs(mergeBase, env = {}) {
  if (!SHA.test(mergeBase)) throw new Error('merge base must be a commit sha');
  const args = [
    'run',
    'type-check',
    'test',
    '--dry=json',
    `--filter=...[${mergeBase}]`,
    '--concurrency=2',
    '--output-logs=none',
    '--no-update-notifier',
  ];
  if (!args.includes('--dry=json')) {
    throw new Error('Turbo selection must stay dry');
  }
  if (!remoteCacheEnabled(env)) args.push('--cache=local:rw');
  return args;
}

function parseDryJson(stdout) {
  const text = String(stdout ?? '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function workspaceDirectory(task, byName) {
  const directory = String(task?.directory ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
  if (/^(?:apps|packages)\/[^/]+$/.test(directory)) return directory;
  return byName.get(task?.package) ?? null;
}

// `packages` is Turbo's filter scope (changed packages and their dependents).
// `tasks` also lists prerequisites such as ^build and ^type-check. Keep a
// package only when the scope names it and it owns a requested type-check or
// test task. Returns null when the payload has no scope list.
function workspacesFromDry(payload, workspaces = []) {
  if (!payload || !Array.isArray(payload.packages)) return null;
  const byName = new Map(
    workspaces
      .filter((entry) => entry.name)
      .map((entry) => [entry.name, entry.workspace])
  );
  const requested = new Set();
  for (const task of payload.tasks ?? []) {
    if (!REQUESTED_TASKS.has(task?.task)) continue;
    const workspace = workspaceDirectory(task, byName);
    if (workspace) requested.add(workspace);
  }
  const selected = [];
  for (const name of payload.packages) {
    const workspace = byName.get(name);
    if (!workspace || !requested.has(workspace)) continue;
    selected.push(workspace);
  }
  return [...new Set(selected)].sort();
}

function cachePresence(env) {
  return remoteCacheEnabled(env) ? 'set' : 'unset';
}

function selectAffectedWorkspaces({
  root,
  mergeBase,
  env = {},
  spawn,
  workspaces = [],
}) {
  const remote = cachePresence(env);
  let args;
  try {
    args = turboDryArgs(mergeBase, env);
  } catch {
    return { ok: false, reason: 'invalid merge base', remote };
  }
  const binary = path.join(root, 'node_modules', '.bin', 'turbo');
  const command = fs.existsSync(binary) ? binary : 'turbo';
  let result;
  try {
    result = spawn(command, args, {
      cwd: root,
      encoding: 'utf8',
      env: { ...env, TURBO_CONCURRENCY: '2' },
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return { ok: false, reason: 'turbo dry failed', remote };
  }
  if (!result || result.error || result.status !== 0) {
    return { ok: false, reason: 'turbo dry failed', remote };
  }
  const selected = workspacesFromDry(parseDryJson(result.stdout), workspaces);
  if (!selected) return { ok: false, reason: 'turbo dry JSON missing', remote };
  return { ok: true, workspaces: selected, remote };
}

module.exports = {
  parseDryJson,
  remoteCacheEnabled,
  selectAffectedWorkspaces,
  turboDryArgs,
  workspacesFromDry,
};
