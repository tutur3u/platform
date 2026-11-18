#!/usr/bin/env node
// Operator CLI behind .github/workflows/shared-secret-write.yaml.
//
//   preflight <secret> <environment>    every destination exists; no writes
//   write vercel <secret> <environment> value on stdin -> Vercel env
//   write workers <secret> <environment> value on stdin -> every Worker
//   verify <secret> <environment>       name + type readback; fails closed
//
// The value is read from stdin only. Output names destinations and types,
// never a value. Credentials come from the environment by name:
// CLOUDFLARE_API_TOKEN, VERCEL_TOKEN, VERCEL_ORG_ID.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertDeclaredIdentity,
  assertSecretValue,
  listVercelEnv,
  listWorkerSecrets,
  putVercelEnv,
  putWorkerSecret,
  readBack,
  verifyVercelEnv,
  verifyWorkerSecret,
  workerExists,
} from './shared-secret-api.mjs';
import { resolveSharedSecret } from './shared-secret-targets.mjs';

function requiredEnv(env, name) {
  assert.ok(env[name], `${name} is not set`);
  return env[name];
}

export async function preflight(plan, { env, fetchImpl = fetch, log }) {
  const token = requiredEnv(env, 'CLOUDFLARE_API_TOKEN');
  requiredEnv(env, 'VERCEL_TOKEN');
  requiredEnv(env, 'VERCEL_ORG_ID');
  for (const { name } of plan.workers) {
    assert.ok(
      await workerExists({ token, name, fetchImpl }),
      `Worker ${name} does not exist; publish it before writing its secret`
    );
    log(`worker ${name} present`);
  }
  log(`vercel ${plan.vercel.key} -> ${plan.vercel.target}`);
}

export async function writeVercel(
  plan,
  value,
  { env, fetchImpl = fetch, log }
) {
  await putVercelEnv({
    token: requiredEnv(env, 'VERCEL_TOKEN'),
    teamId: requiredEnv(env, 'VERCEL_ORG_ID'),
    projectId: plan.vercel.projectId,
    key: plan.vercel.key,
    target: plan.vercel.target,
    value,
    fetchImpl,
  });
  log(`wrote vercel ${plan.vercel.key} (${plan.vercel.type})`);
}

export async function writeWorkers(
  plan,
  value,
  { env, fetchImpl = fetch, log }
) {
  const token = requiredEnv(env, 'CLOUDFLARE_API_TOKEN');
  for (const { name, binding } of plan.workers) {
    await putWorkerSecret({ token, name, binding, value, fetchImpl });
    log(`wrote ${name}: ${binding} (secret_text)`);
  }
}

export async function verify(plan, { env, fetchImpl = fetch, log, retry }) {
  const token = requiredEnv(env, 'CLOUDFLARE_API_TOKEN');
  const vercel = {
    token: requiredEnv(env, 'VERCEL_TOKEN'),
    teamId: requiredEnv(env, 'VERCEL_ORG_ID'),
    projectId: plan.vercel.projectId,
    fetchImpl,
  };
  log(
    await readBack(
      () => listVercelEnv(vercel),
      (entries) => verifyVercelEnv(entries, plan.vercel),
      retry
    )
  );
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
  const plan = (secret, environment) =>
    resolveSharedSecret({ secret, environment, root });
  const stdin = () => assertSecretValue((readStdin ?? readValue)());
  if (command === 'preflight')
    return preflight(plan(...rest), { env, fetchImpl, log });
  if (command === 'verify')
    return verify(plan(...rest), { env, fetchImpl, log, retry });
  assert.equal(command, 'write', 'usage: preflight|write|verify');
  const [kind, ...target] = rest;
  assert.ok(kind === 'vercel' || kind === 'workers', 'write vercel|workers');
  const resolved = plan(...target);
  const value = stdin();
  return kind === 'vercel'
    ? writeVercel(resolved, value, { env, fetchImpl, log })
    : writeWorkers(resolved, value, { env, fetchImpl, log });
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
