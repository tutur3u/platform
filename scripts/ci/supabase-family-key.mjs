#!/usr/bin/env node
// Operator CLI behind .github/workflows/supabase-family-key.yaml.
//
//   preflight   the key does not exist yet and every family Worker exists
//   create      creates the `cf-web-families` secret key; the new value is the
//               only stdout, for the caller to capture into a variable
//   put         value on stdin -> SUPABASE_SECRET_KEY on every family Worker
//   verify      name/id/type readback of the key and each Worker secret
//   revoke      deletes the named Supabase key and verifies its absence
//
// Credentials come from the environment by name: SUPABASE_ACCESS_TOKEN and
// CLOUDFLARE_API_TOKEN. A value is never printed except by `create`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertDeclaredIdentity,
  assertSecretValue,
  createSupabaseKey,
  deleteSupabaseKey,
  listSupabaseKeys,
  listWorkerSecrets,
  putWorkerSecret,
  readBack,
  verifySupabaseKey,
  verifyWorkerSecret,
  workerExists,
} from './shared-secret-api.mjs';
import {
  resolveSupabaseFamilyTargets,
  SUPABASE_FAMILY_KEY_NAME,
  SUPABASE_PROJECT_REF,
} from './shared-secret-targets.mjs';

function requiredEnv(env, name) {
  assert.ok(env[name], `${name} is not set`);
  return env[name];
}

async function assertKeyAbsent({ plan, env, fetchImpl }) {
  const keys = await listSupabaseKeys({
    token: requiredEnv(env, 'SUPABASE_ACCESS_TOKEN'),
    ref: plan.projectRef,
    fetchImpl,
  });
  assert.ok(
    !keys.some((key) => key.name === plan.keyName),
    `a key named ${plan.keyName} already exists; no second key is created`
  );
}

export async function preflight(plan, { env, fetchImpl = fetch, log }) {
  const token = requiredEnv(env, 'CLOUDFLARE_API_TOKEN');
  for (const { name } of plan.workers) {
    assert.ok(
      await workerExists({ token, name, fetchImpl }),
      `Worker ${name} does not exist; publish it before writing its secret`
    );
    log(`worker ${name} present`);
  }
  await assertKeyAbsent({ plan, env, fetchImpl });
  log(`key ${plan.keyName} absent`);
}

/** Returns the new key value; the caller owns masking it. */
export async function create(plan, { env, fetchImpl = fetch }) {
  await assertKeyAbsent({ plan, env, fetchImpl });
  return createSupabaseKey({
    token: requiredEnv(env, 'SUPABASE_ACCESS_TOKEN'),
    ref: plan.projectRef,
    name: plan.keyName,
    fetchImpl,
  });
}

export async function put(plan, value, { env, fetchImpl = fetch, log }) {
  const token = requiredEnv(env, 'CLOUDFLARE_API_TOKEN');
  for (const { name, binding } of plan.workers) {
    await putWorkerSecret({ token, name, binding, value, fetchImpl });
    log(`wrote ${name}: ${binding} (secret_text)`);
  }
}

export async function verify(plan, { env, fetchImpl = fetch, log, retry }) {
  const supabase = {
    token: requiredEnv(env, 'SUPABASE_ACCESS_TOKEN'),
    ref: plan.projectRef,
    fetchImpl,
  };
  log(
    await readBack(
      () => listSupabaseKeys(supabase),
      (entries) => verifySupabaseKey(entries, plan.keyName),
      retry
    )
  );
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

export async function revoke({ env, fetchImpl = fetch, log, retry }) {
  const name = SUPABASE_FAMILY_KEY_NAME;
  const request = {
    token: requiredEnv(env, 'SUPABASE_ACCESS_TOKEN'),
    ref: SUPABASE_PROJECT_REF,
    fetchImpl,
  };
  const list = () => listSupabaseKeys(request);
  const keys = await list();
  const key = keys.find((entry) => entry.name === name);
  if (!key) {
    log(`key ${name} already absent`);
    return;
  }
  verifySupabaseKey(keys, name);
  await deleteSupabaseKey({ ...request, id: key.id });
  log(
    await readBack(
      list,
      (entries) => {
        assert.ok(
          !entries.some((entry) => entry.id === key.id || entry.name === name),
          `key ${name} is still present`
        );
        return `key ${name} revoked`;
      },
      retry
    )
  );
}

export async function main(
  argv,
  { env = process.env, fetchImpl = fetch, readStdin } = {}
) {
  const commands = ['preflight', 'create', 'put', 'verify', 'revoke'];
  const [command] = argv;
  assert.ok(
    argv.length === 1 && commands.includes(command),
    `usage: ${commands.join('|')}`
  );
  assertDeclaredIdentity(env);
  const log = (line) => console.log(line);
  const retry = { attempts: 5, delayMs: 3000 };
  if (command === 'revoke') return revoke({ env, fetchImpl, log, retry });
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const plan = resolveSupabaseFamilyTargets(root);
  if (command === 'preflight') return preflight(plan, { env, fetchImpl, log });
  if (command === 'create') {
    process.stdout.write(await create(plan, { env, fetchImpl }));
    return undefined;
  }
  if (command === 'put') {
    const value = assertSecretValue(
      (readStdin ?? (() => readFileSync(0, 'utf8')))()
    );
    return put(plan, value, { env, fetchImpl, log });
  }
  return verify(plan, { env, fetchImpl, log, retry });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    const detail =
      error instanceof assert.AssertionError
        ? error.message
        : `unexpected ${/^[A-Za-z]{1,40}$/.test(error?.name) ? error.name : 'error'}`;
    console.error(
      `Supabase family key ${process.argv[2] ?? ''} failed: ${detail}`
    );
    process.exitCode = 1;
  }
}
