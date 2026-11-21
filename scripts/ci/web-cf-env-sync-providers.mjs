// Provider calls for scripts/ci/web-cf-env-sync.mjs.
//
// A value travels only in a response body (Vercel reveal) or a request body
// (Cloudflare writes). It is never placed in a URL, header, argv, log line or
// error message, and no message here quotes a provider body: diagnostics are
// limited to HTTP status, numeric Cloudflare codes and Vercel error codes that
// match a fixed lowercase identifier shape. Fetch and spawn are injected.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLOUDFLARE_ACCOUNT_ID } from './shared-secret-targets.mjs';

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
const VERCEL_API = 'https://api.vercel.com';
const TIMEOUT_MS = 30_000;
const VERCEL_CODE = /^[a-z][a-z0-9_]{0,59}$/;
const VERCEL_ID = /^[A-Za-z0-9_-]{4,64}$/;

export const VERCEL_TEAM_ID = 'team_Lkh7uJVMinb0NPDo63OvFjYa';

/** Raised when Vercel demands an interactive re-authentication to reveal. */
export class VercelChallengeError extends assert.AssertionError {
  constructor() {
    super({
      message:
        'Vercel requires a re-authentication challenge to reveal values; run `vercel login` (or use a freshly issued VERCEL_TOKEN) and retry',
    });
    this.code = 'challenge_required';
  }
}

async function parse(response) {
  try {
    return await response.json();
  } catch {
    // A parse error can quote the body; drop it.
    return undefined;
  }
}

function cloudflareCodes(body) {
  const list = (Array.isArray(body?.errors) ? body.errors : [])
    .map((entry) => entry?.code)
    .filter((code) => Number.isSafeInteger(code))
    .slice(0, 3);
  return list.length ? ` (codes ${list.join(', ')})` : '';
}

function vercelCode(body) {
  const code = body?.error?.code;
  return typeof code === 'string' && VERCEL_CODE.test(code) ? code : null;
}

function request(fetchImpl, url, { token, method = 'GET', body, form }) {
  return fetchImpl(url, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    ...(form !== undefined && { body: form }),
  });
}

// Vercel credentials ------------------------------------------------------

/** VERCEL_TOKEN, else the Vercel CLI login (`vercel whoami` identity). */
export function resolveVercelToken({ env, readFile = readFileSync }) {
  if (env.VERCEL_TOKEN) return env.VERCEL_TOKEN;
  const base =
    platform() === 'darwin'
      ? join(homedir(), 'Library/Application Support')
      : (env.XDG_DATA_HOME ?? join(homedir(), '.local/share'));
  let token;
  try {
    token = JSON.parse(
      readFile(join(base, 'com.vercel.cli/auth.json'), 'utf8')
    )?.token;
  } catch {
    token = undefined;
  }
  assert.ok(
    typeof token === 'string' && token.length > 0,
    'set VERCEL_TOKEN or log in with the Vercel CLI'
  );
  return token;
}

// Vercel ---------------------------------------------------------------------

const team = `teamId=${encodeURIComponent(VERCEL_TEAM_ID)}`;

function targets(entry) {
  return [entry?.target ?? []]
    .flat()
    .filter((item) => typeof item === 'string');
}

/** Production entries of the project, without values. */
export async function listProjectEnv({ token, projectId, fetchImpl = fetch }) {
  const response = await request(
    fetchImpl,
    `${VERCEL_API}/v10/projects/${projectId}/env?decrypt=false&${team}`,
    { token }
  );
  const body = await parse(response);
  assert.ok(
    response.ok && Array.isArray(body?.envs),
    `Vercel project env list failed with HTTP ${response.status}`
  );
  return body.envs
    .filter((entry) => targets(entry).includes('production'))
    .filter((entry) => !entry?.gitBranch)
    .map((entry) => ({
      id: entry?.id,
      key: entry?.key,
      type: entry?.type,
      source: 'project',
    }));
}

/** Team-shared production entries linked to the project, without values. */
export async function listSharedEnv({ token, projectId, fetchImpl = fetch }) {
  const entries = [];
  let until = '';
  for (let page = 0; page < 20; page++) {
    const response = await request(
      fetchImpl,
      `${VERCEL_API}/v1/env?${team}&limit=100${until}`,
      { token }
    );
    const body = await parse(response);
    assert.ok(
      response.ok && Array.isArray(body?.data),
      `Vercel shared env list failed with HTTP ${response.status}`
    );
    for (const entry of body.data)
      if (
        targets(entry).includes('production') &&
        [entry?.projectId ?? []].flat().includes(projectId)
      )
        entries.push({
          id: entry?.id,
          key: entry?.key,
          type: entry?.type,
          source: 'shared',
        });
    const next = body.pagination?.next;
    if (!Number.isSafeInteger(next)) return entries;
    until = `&until=${next}`;
  }
  throw new assert.AssertionError({
    message: 'Vercel shared env list exceeded 20 pages',
  });
}

/** Reveals one value. Throws VercelChallengeError on a step-up demand. */
export async function revealValue({
  token,
  projectId,
  entry,
  fetchImpl = fetch,
}) {
  assert.ok(VERCEL_ID.test(entry.id ?? ''), `${entry.key}: unexpected env id`);
  const url =
    entry.source === 'shared'
      ? `${VERCEL_API}/v1/env/${entry.id}?${team}`
      : `${VERCEL_API}/v1/projects/${projectId}/env/${entry.id}?${team}`;
  const response = await request(fetchImpl, url, { token });
  const body = await parse(response);
  if (response.status === 403 && vercelCode(body) === 'challenge_required')
    throw new VercelChallengeError();
  const code = vercelCode(body);
  assert.ok(
    response.ok,
    `Vercel reveal of ${entry.key} failed with HTTP ${response.status}${code ? ` (${code})` : ''}`
  );
  return typeof body?.value === 'string' ? body.value : null;
}

// Cloudflare -----------------------------------------------------------------

const script = (name) =>
  `${CLOUDFLARE_API}/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${encodeURIComponent(name)}`;

/** Current bindings as `{ name, type }`, or null when the Worker is absent. */
export async function readBindings({ token, worker, fetchImpl = fetch }) {
  const response = await request(fetchImpl, `${script(worker)}/settings`, {
    token,
  });
  if (response.status === 404) return null;
  const body = await parse(response);
  assert.ok(
    response.ok && Array.isArray(body?.result?.bindings),
    `settings read on ${worker} failed with HTTP ${response.status}${cloudflareCodes(body)}`
  );
  return body.result.bindings.map((binding) => ({
    name: binding?.name,
    type: binding?.type,
    ...(binding?.type === 'plain_text' && { text: binding?.text }),
  }));
}

/**
 * Sets plain-text vars and keeps every other binding through `inherit`. The
 * settings endpoint replaces the binding list, so each current binding that
 * is not being set is listed by name.
 */
export async function patchVars({
  token,
  worker,
  current,
  vars,
  fetchImpl = fetch,
}) {
  const bindings = [
    ...current
      .filter((binding) => !Object.hasOwn(vars, binding.name))
      .map((binding) => ({ type: 'inherit', name: binding.name })),
    ...Object.entries(vars).map(([name, text]) => ({
      type: 'plain_text',
      name,
      text,
    })),
  ];
  const form = new FormData();
  form.set(
    'settings',
    new Blob([JSON.stringify({ bindings })], { type: 'application/json' })
  );
  const response = await request(fetchImpl, `${script(worker)}/settings`, {
    token,
    method: 'PATCH',
    form,
  });
  const body = await parse(response);
  assert.ok(
    response.ok && body?.success === true,
    `vars write on ${worker} failed with HTTP ${response.status}${cloudflareCodes(body)}`
  );
}

/** One version carrying every secret (JSON Merge Patch; others unchanged). */
export async function patchSecrets({
  token,
  worker,
  secrets,
  fetchImpl = fetch,
}) {
  const response = await request(fetchImpl, `${script(worker)}/secrets-bulk`, {
    token,
    method: 'PATCH',
    body: {
      secrets: Object.fromEntries(
        Object.entries(secrets).map(([name, text]) => [
          name,
          { name, text, type: 'secret_text' },
        ])
      ),
    },
  });
  // The response may echo the values; only the status and codes are used.
  const body = await parse(response);
  assert.ok(
    response.ok && body?.success === true,
    `secrets write on ${worker} failed with HTTP ${response.status}${cloudflareCodes(body)}`
  );
}

// Cloudflare through the `cf` CLI ------------------------------------------
//
// Used when no CLOUDFLARE_API_TOKEN is set: the CLI holds its own OAuth login.
// Values reach `cf` only through a 0600 file in a fresh 0700 directory that
// is removed afterwards; stdout and stderr of a write are discarded because a
// write response can echo the values.

function cfEnv(env) {
  return { ...env, CLOUDFLARE_ACCOUNT_ID };
}

/** Latest uploaded version's bindings, or null when the Worker is absent. */
export function cfReadBindings({ worker, env, spawn = spawnSync }) {
  const result = spawn(
    'cf',
    ['workers', 'versions', 'list', '--worker', worker, '--per-page', '5'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
      env: cfEnv(env),
    }
  );
  if (result.status !== 0 && /\[10007\]/.test(result.stderr ?? '')) return null;
  assert.equal(result.status, 0, `cf versions list on ${worker} failed`);
  let versions;
  try {
    versions = JSON.parse(result.stdout);
  } catch {
    versions = undefined;
  }
  assert.ok(Array.isArray(versions), `cf versions list on ${worker}: no JSON`);
  if (versions.length === 0) return [];
  const latest = versions.reduce((a, b) =>
    (b?.number ?? 0) > (a?.number ?? 0) ? b : a
  );
  return (Array.isArray(latest?.bindings) ? latest.bindings : []).map(
    (binding) => ({
      name: binding?.name,
      type: binding?.type,
      ...(binding?.type === 'plain_text' && { text: binding?.text }),
    })
  );
}

export function cfPatchSecrets({
  worker,
  secrets,
  env,
  spawn = spawnSync,
  fs = { mkdtempSync, writeFileSync, rmSync },
}) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'web-cf-env-sync-'));
  try {
    const file = join(dir, 'secrets.json');
    fs.writeFileSync(
      file,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(secrets).map(([name, text]) => [
            name,
            { name, text, type: 'secret_text' },
          ])
        )
      ),
      { mode: 0o600, flag: 'wx' }
    );
    const result = spawn(
      'cf',
      [
        'workers',
        'secrets',
        'bulk-edit',
        '--worker',
        worker,
        '--secrets',
        `@${file}`,
      ],
      {
        stdio: ['ignore', 'ignore', 'ignore'],
        timeout: 120_000,
        env: cfEnv(env),
      }
    );
    assert.equal(result.status, 0, `cf secrets bulk-edit on ${worker} failed`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Cloudflare operations: the REST API when CLOUDFLARE_API_TOKEN is set (CI),
 * otherwise the `cf` CLI login. The CLI has no script-settings write, so the
 * `cf` client cannot set plain-text vars (`patchVars` is null).
 */
export function cloudflareClient({
  env,
  fetchImpl = fetch,
  spawn = spawnSync,
}) {
  const token = env.CLOUDFLARE_API_TOKEN;
  if (token)
    return {
      transport: 'api',
      readBindings: (worker) => readBindings({ token, worker, fetchImpl }),
      patchVars: (args) => patchVars({ token, ...args, fetchImpl }),
      patchSecrets: (args) => patchSecrets({ token, ...args, fetchImpl }),
    };
  return {
    transport: 'cf',
    readBindings: (worker) => cfReadBindings({ worker, env, spawn }),
    patchVars: null,
    patchSecrets: (args) => cfPatchSecrets({ ...args, env, spawn }),
  };
}
