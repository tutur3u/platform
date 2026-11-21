// Provider calls for the dispatch-only secret workflows. A secret value only
// ever travels in a request body; it is never placed in a URL or header, and
// no message built here quotes a response body, so a provider echoing the
// value back cannot reach the log. Fetch is injected for tests.
import assert from 'node:assert/strict';
import {
  CLOUDFLARE_ACCOUNT_ID,
  SUPABASE_PROJECT_REF,
} from './shared-secret-targets.mjs';

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
const VERCEL_API = 'https://api.vercel.com';
const SUPABASE_API = 'https://api.supabase.com';
const TIMEOUT_MS = 30_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Output of `openssl rand -base64 48` and Supabase API keys.
export const SECRET_VALUE = /^[A-Za-z0-9+/=._-]{32,512}$/;

export function assertSecretValue(value) {
  assert.ok(
    typeof value === 'string' && SECRET_VALUE.test(value),
    'secret value is missing or has an unexpected shape'
  );
  return value;
}

/** The workflow declares the hard-coded identity; a differing value is a bug. */
export function assertDeclaredIdentity(env) {
  assert.ok(
    env.CLOUDFLARE_ACCOUNT_ID === undefined ||
      env.CLOUDFLARE_ACCOUNT_ID === CLOUDFLARE_ACCOUNT_ID,
    'CLOUDFLARE_ACCOUNT_ID differs from the reviewed account'
  );
  assert.ok(
    env.SUPABASE_PROJECT_REF === undefined ||
      env.SUPABASE_PROJECT_REF === SUPABASE_PROJECT_REF,
    'SUPABASE_PROJECT_REF differs from the reviewed project'
  );
}

/** Numeric provider error codes only; free-form text is never printed. */
function codes(body) {
  const list = (Array.isArray(body?.errors) ? body.errors : [])
    .map((entry) => entry?.code)
    .filter((code) => Number.isSafeInteger(code))
    .slice(0, 3);
  return list.length ? ` (codes ${list.join(', ')})` : '';
}

async function send(fetchImpl, label, url, { token, method = 'GET', body }) {
  const response = await fetchImpl(url, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined && { accept: 'application/json' }),
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  let parsed;
  try {
    parsed = await response.json();
  } catch {
    // A parse error can quote the body; drop it.
  }
  assert.ok(
    response.ok,
    `${label} failed with HTTP ${response.status}${codes(parsed)}`
  );
  assert.ok(parsed && typeof parsed === 'object', `${label} returned no JSON`);
  return parsed;
}

const worker = (name) =>
  `${CLOUDFLARE_API}/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${encodeURIComponent(name)}`;

// Cloudflare ---------------------------------------------------------------

export async function workerExists({ token, name, fetchImpl = fetch }) {
  const response = await fetchImpl(`${worker(name)}/settings`, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (response.status === 404) return false;
  assert.ok(
    response.ok,
    `Worker lookup failed with HTTP ${response.status} for ${name}`
  );
  return true;
}

export async function putWorkerSecret({
  token,
  name,
  binding,
  value,
  fetchImpl = fetch,
}) {
  assertSecretValue(value);
  const body = await send(
    fetchImpl,
    `secret write ${binding} on ${name}`,
    `${worker(name)}/secrets`,
    {
      token,
      method: 'PUT',
      body: { name: binding, text: value, type: 'secret_text' },
    }
  );
  assert.ok(body.success === true, `secret write rejected for ${name}`);
}

export async function listWorkerSecrets({ token, name, fetchImpl = fetch }) {
  const body = await send(
    fetchImpl,
    `secret list on ${name}`,
    `${worker(name)}/secrets`,
    { token }
  );
  assert.ok(Array.isArray(body.result), `secret list unavailable for ${name}`);
  return body.result.map((entry) => ({ name: entry?.name, type: entry?.type }));
}

// Vercel -------------------------------------------------------------------

const envPath = (projectId) => `${VERCEL_API}/v10/projects/${projectId}/env`;

export async function putVercelEnv({
  token,
  teamId,
  projectId,
  key,
  target,
  value,
  fetchImpl = fetch,
}) {
  assertSecretValue(value);
  await send(
    fetchImpl,
    `Vercel env write ${key}`,
    `${envPath(projectId)}?upsert=true&teamId=${encodeURIComponent(teamId)}`,
    {
      token,
      method: 'POST',
      body: { key, value, type: 'sensitive', target: [target] },
    }
  );
}

export async function listVercelEnv({
  token,
  teamId,
  projectId,
  fetchImpl = fetch,
}) {
  const body = await send(
    fetchImpl,
    'Vercel env list',
    `${envPath(projectId)}?decrypt=false&teamId=${encodeURIComponent(teamId)}`,
    { token }
  );
  assert.ok(Array.isArray(body.envs), 'Vercel env list unavailable');
  return body.envs.map((entry) => ({
    key: entry?.key,
    type: entry?.type,
    target: [entry?.target ?? []].flat(),
  }));
}

// Supabase -----------------------------------------------------------------

const keysPath = (ref) =>
  `${SUPABASE_API}/v1/projects/${encodeURIComponent(ref)}/api-keys`;

/** Key listing without values: `reveal=false`. */
export async function listSupabaseKeys({ token, ref, fetchImpl = fetch }) {
  const body = await send(
    fetchImpl,
    'Supabase key list',
    `${keysPath(ref)}?reveal=false`,
    { token }
  );
  assert.ok(Array.isArray(body), 'Supabase key list unavailable');
  return body.map((entry) => ({
    name: entry?.name,
    id: entry?.id,
    type: entry?.type,
  }));
}

/** Creates a secret key and returns its value; the caller must mask it. */
export async function createSupabaseKey({
  token,
  ref,
  name,
  fetchImpl = fetch,
}) {
  const body = await send(
    fetchImpl,
    'Supabase key creation',
    `${keysPath(ref)}?reveal=true`,
    { token, method: 'POST', body: { type: 'secret', name } }
  );
  return assertSecretValue(body.api_key);
}

export async function deleteSupabaseKey({ token, ref, id, fetchImpl = fetch }) {
  assert.ok(UUID.test(id), 'Supabase key has an unexpected id shape');
  await send(
    fetchImpl,
    'Supabase key deletion',
    `${keysPath(ref)}/${id}?reveal=false`,
    { token, method: 'DELETE' }
  );
}

// Readback verification (names and types only) ------------------------------

function unique(entries, predicate, label) {
  const matches = entries.filter(predicate);
  assert.equal(matches.length, 1, `${label}: expected exactly one entry`);
  return matches[0];
}

/** One `secret_text` entry for the binding, no duplicates. */
export function verifyWorkerSecret(entries, name, binding) {
  const entry = unique(
    entries,
    (item) => item.name === binding,
    `${name} secret ${binding}`
  );
  assert.equal(entry.type, 'secret_text', `${name} ${binding}: wrong type`);
  return `${name}: ${binding} (${entry.type})`;
}

/** One `sensitive` entry for the key on the target, no overlapping entries. */
export function verifyVercelEnv(entries, { key, target, type }) {
  const entry = unique(
    entries,
    (item) => item.key === key && item.target.includes(target),
    `Vercel ${key} on ${target}`
  );
  assert.equal(entry.type, type, `Vercel ${key}: wrong type`);
  assert.deepEqual(entry.target, [target], `Vercel ${key}: wrong target set`);
  return `vercel ${key} (${entry.type}) on ${target}`;
}

export function verifySupabaseKey(entries, name) {
  const entry = unique(
    entries,
    (item) => item.name === name,
    `Supabase key ${name}`
  );
  assert.equal(entry.type, 'secret', `Supabase key ${name}: wrong type`);
  assert.ok(UUID.test(entry.id), `Supabase key ${name}: unexpected id shape`);
  return `supabase key ${name} id ${entry.id} (${entry.type})`;
}

/** Re-read until the verifier passes; provider lists can lag a write. */
export async function readBack(read, verify, { attempts = 5, delayMs = 3000 }) {
  let failure;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return verify(await read());
    } catch (error) {
      if (!(error instanceof assert.AssertionError)) throw error;
      failure = error;
      if (attempt < attempts)
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw failure;
}
