// Sets the Worker secrets of the Whiteboards Worker from the GitHub
// secrets of its protected environment, by name. Dispatch-only (see
// .github/workflows/whiteboards-worker-secrets.yaml). The values travel only
// in request bodies: they are never an argument, output, file or log line, and
// no message here quotes a provider response. Fetch is injected for tests.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export const ACCOUNT_ID = 'e8912e2867beecc673d171907bf09649';
export const WORKER = 'tuturuuu-whiteboards';
// Required on the Worker; a run without any of them stops before it writes.
export const REQUIRED = Object.freeze([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
]);
// Written when present. The coordination secrets are shared by every app and
// no agent can copy them; the signer chain falls back to SUPABASE_SECRET_KEY
// (apps/docs/build/devops/app-coordination-secret-rollout.mdx), as Lettin's
// deploy treats them (`--optional`).
export const OPTIONAL = Object.freeze([
  'TUTURUUU_APP_COORDINATION_SECRET',
  'APP_COORDINATION_TOKEN_SECRET',
]);
export const BINDINGS = Object.freeze([...REQUIRED, ...OPTIONAL]);
// Binding name -> the GitHub secret that holds its value.
export const SOURCES = Object.freeze({
  NEXT_PUBLIC_SUPABASE_URL: 'PRODUCTION_SUPABASE_URL',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'PRODUCTION_SUPABASE_PUBLISHABLE_KEY',
  SUPABASE_SECRET_KEY: 'PRODUCTION_SUPABASE_SECRET_KEY',
  TUTURUUU_APP_COORDINATION_SECRET: 'TUTURUUU_APP_COORDINATION_SECRET',
  APP_COORDINATION_TOKEN_SECRET: 'APP_COORDINATION_TOKEN_SECRET',
});
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER}`;
const TIMEOUT_MS = 30_000;
const SUPABASE_ORIGIN = /^https:\/\/[a-z0-9-]+\.supabase\.co$/u;
const OPAQUE = /^[A-Za-z0-9+/=._-]{20,2048}$/u;
const PLACEHOLDER = /(?:placeholder|local-development|synthetic|invalid)/iu;

/** Shape check only; a value that fails is never echoed. */
export function assertValue(binding, value) {
  assert.ok(
    typeof value === 'string' && value.length > 0,
    `${binding} is unset`
  );
  assert.ok(!PLACEHOLDER.test(value), `${binding} looks like a placeholder`);
  assert.ok(
    binding === 'NEXT_PUBLIC_SUPABASE_URL'
      ? SUPABASE_ORIGIN.test(value)
      : OPAQUE.test(value),
    `${binding} has an unexpected shape`
  );
}

function codes(body) {
  const list = (Array.isArray(body?.errors) ? body.errors : [])
    .map((entry) => entry?.code)
    .filter((code) => Number.isSafeInteger(code))
    .slice(0, 3);
  return list.length ? ` (codes ${list.join(', ')})` : '';
}

async function call(fetchImpl, token, label, path, init = {}) {
  const response = await fetchImpl(`${API}${path}`, {
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(init.body !== undefined && { 'content-type': 'application/json' }),
    },
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
  assert.ok(parsed?.success === true, `${label} was rejected`);
  return parsed;
}

/** Writes every binding, in order, then reads names and types back. */
export async function writeSecrets({ token, env, fetchImpl = fetch }) {
  assert.ok(token, 'Cloudflare token is unset');
  const skipped = [];
  const values = [];
  for (const binding of BINDINGS) {
    const value = env[SOURCES[binding]];
    if (OPTIONAL.includes(binding) && !value) {
      skipped.push(binding);
      continue;
    }
    assertValue(binding, value);
    values.push([binding, value]);
  }
  // The two coordination secrets belong to one signer chain and may be equal.
  const required = values.filter(([binding]) => REQUIRED.includes(binding));
  assert.equal(
    new Set(required.map(([, value]) => value)).size,
    required.length,
    'two required bindings share one value'
  );
  const lookup = await fetchImpl(`${API}/settings`, {
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  assert.notEqual(
    lookup.status,
    404,
    `Worker ${WORKER} is not uploaded yet; upload it first`
  );
  assert.ok(lookup.ok, `Worker lookup failed with HTTP ${lookup.status}`);
  for (const [binding, value] of values) {
    await call(fetchImpl, token, `secret write ${binding}`, '/secrets', {
      method: 'PUT',
      body: JSON.stringify({ name: binding, text: value, type: 'secret_text' }),
    });
  }
  const written = await listSecrets({ token, fetchImpl });
  for (const [binding] of values) uniqueSecret(written, binding);
  return [
    ...values.map(([binding]) => `${WORKER}: ${binding} (secret_text)`),
    ...skipped.map((binding) => `${WORKER}: ${binding} not set (optional)`),
  ];
}

async function listSecrets({ token, fetchImpl }) {
  const body = await call(fetchImpl, token, 'secret list', '/secrets');
  assert.ok(Array.isArray(body.result), 'secret list unavailable');
  return body.result;
}

function uniqueSecret(entries, binding) {
  const matches = entries.filter((entry) => entry?.name === binding);
  assert.equal(matches.length, 1, `${WORKER}: expected exactly one ${binding}`);
  assert.equal(matches[0].type, 'secret_text', `${binding}: wrong type`);
}

/** Names and types only; the required bindings must exist, optional ones are listed when present. */
export async function verifySecrets({ token, fetchImpl = fetch }) {
  const entries = await listSecrets({ token, fetchImpl });
  for (const binding of REQUIRED) uniqueSecret(entries, binding);
  return BINDINGS.flatMap((binding) => {
    const present = entries.some((entry) => entry?.name === binding);
    if (!present && OPTIONAL.includes(binding))
      return [`${WORKER}: ${binding} not set (optional)`];
    uniqueSecret(entries, binding);
    return [`${WORKER}: ${binding} (secret_text)`];
  });
}

async function main([command]) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (command === 'plan') {
    for (const binding of BINDINGS)
      console.log(
        `${binding} <- GitHub secret ${SOURCES[binding]} -> ${WORKER}`
      );
    return;
  }
  assert.ok(
    command === 'write' || command === 'verify',
    'usage: plan | write | verify'
  );
  const lines =
    command === 'write'
      ? await writeSecrets({ token, env: process.env })
      : await verifySecrets({ token });
  for (const line of lines) console.log(line);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : 'failed');
    process.exitCode = 1;
  });
}
