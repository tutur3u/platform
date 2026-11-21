#!/usr/bin/env node
// Operator CLI behind .github/workflows/shared-secret-write.yaml.
//
//   plan <secret> <environment> [scope]       destinations and rotation notes
//   preflight <secret> <environment> [scope]  every destination exists
//   write workers <secret> <environment> [scope]  value on stdin -> Workers
//   verify <secret> <environment> [scope]     name + type readback
//
// `scope` is `all` (default) or `web`: `web` selects only the apps/web Workers
// and leaves the peer Workers alone, which is how an existing value
// is copied to a new web Worker without rotating it. `plan` needs no
// credentials and makes no request.
//
// The value is read from stdin only. Output names destinations and types,
// never a value. Credentials come from the environment by name:
// CLOUDFLARE_API_TOKEN. Nothing is written to Vercel.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertDeclaredIdentity,
  assertSecretValue,
  listWorkerSecrets,
  putWorkerSecret,
  readBack,
  verifyWorkerSecret,
  workerExists,
} from './shared-secret-api.mjs';
import { formatRotationPlan } from './shared-secret-rotation.mjs';
import { resolveSharedSecret } from './shared-secret-targets.mjs';

function requiredEnv(env, name) {
  assert.ok(env[name], `${name} is not set`);
  return env[name];
}

export async function preflight(plan, { env, fetchImpl = fetch, log }) {
  const token = requiredEnv(env, 'CLOUDFLARE_API_TOKEN');
  assert.ok(
    plan.workers.length > 0,
    `no Worker selected for ${plan.secret}; opt the vinext families in first`
  );
  for (const { name } of plan.workers) {
    assert.ok(
      await workerExists({ token, name, fetchImpl }),
      `Worker ${name} does not exist; publish it before writing its secret`
    );
    log(`worker ${name} present`);
  }
}

export async function writeWorkers(
  plan,
  value,
  { env, fetchImpl = fetch, log }
) {
  const token = requiredEnv(env, 'CLOUDFLARE_API_TOKEN');
  // Scope all replaces the value everywhere and is only for a minted value;
  // scope web copies the current value to the web Workers for any secret.
  assert.ok(
    plan.scope === 'web' || plan.mode === 'mint',
    `${plan.secret} is not minted here; copy it with scope web`
  );
  for (const { name, binding } of plan.workers) {
    await putWorkerSecret({ token, name, binding, value, fetchImpl });
    log(`wrote ${name}: ${binding} (secret_text)`);
  }
}

export async function verify(plan, { env, fetchImpl = fetch, log, retry }) {
  const token = requiredEnv(env, 'CLOUDFLARE_API_TOKEN');
  for (const { name, binding } of plan.workers)
    log(
      await readBack(
        () => listWorkerSecrets({ token, name, fetchImpl }),
        (entries) => verifyWorkerSecret(entries, name, binding),
        retry
      )
    );
}

export async function main(
  argv,
  { env = process.env, fetchImpl = fetch, readStdin } = {}
) {
  const [command, ...rest] = argv;
  assertDeclaredIdentity(env);
  const log = (line) => console.log(line);
  const retry = { attempts: 5, delayMs: 3000 };
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const plan = (secret, environment, scope = 'all') =>
    resolveSharedSecret({ secret, environment, root, scope });
  const stdin = () => assertSecretValue((readStdin ?? readValue)());
  if (command === 'plan') return log(formatRotationPlan(plan(...rest)));
  if (command === 'preflight')
    return preflight(plan(...rest), { env, fetchImpl, log });
  if (command === 'verify')
    return verify(plan(...rest), { env, fetchImpl, log, retry });
  assert.equal(command, 'write', 'usage: plan|preflight|write|verify');
  const [kind, ...target] = rest;
  assert.equal(kind, 'workers', 'usage: write workers <secret> <environment>');
  const resolved = plan(...target);
  const value = stdin();
  return writeWorkers(resolved, value, { env, fetchImpl, log });
}

function readValue() {
  return readFileSync(0, 'utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    // Assertion messages are composed from trusted values; anything else
    // may quote provider data, so only its class name is reported.
    const detail =
      error instanceof assert.AssertionError
        ? error.message
        : `unexpected ${/^[A-Za-z]{1,40}$/.test(error?.name) ? error.name : 'error'}`;
    console.error(`Shared secret ${process.argv[2] ?? ''} failed: ${detail}`);
    process.exitCode = 1;
  }
}
