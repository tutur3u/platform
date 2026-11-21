// Behavior of the secret operator scripts: no secret value in argv, URLs,
// headers, output or error text, and fail-closed readback. The workflow
// contract itself is pinned by shared-secret-write.test.mjs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  putWorkerSecret,
  readBack,
  verifySupabaseKey,
  verifyWorkerSecret,
} from './shared-secret-api.mjs';
import * as familyKey from './supabase-family-key.mjs';
import * as sharedSecret from './shared-secret.mjs';
import {
  FAMILIES_FILE,
  readFamilyWorkers,
  resolveSharedSecret,
  resolveSupabaseFamilyTargets,
} from './shared-secret-targets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../..');
const ACCOUNT = 'e8912e2867beecc673d171907bf09649';
// 64 base64 characters, shaped like `openssl rand -base64 48`.
const VALUE = 'Zk9Qd2xjTnJ0eUh2bUJxMVd6U2Y4a0xwRDNhRzVqVXhNYzJPdkVuQTdyS2g=';

// Behavior ------------------------------------------------------------------

/** A fetch double recording every request and echoing bodies in errors. */
function provider(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const route = routes.find(
      ({ match, method = 'GET' }) =>
        String(url).includes(match) && (init.method ?? 'GET') === method
    );
    const reply = route?.reply ?? {
      status: 404,
      body: { errors: [{ code: 1 }] },
    };
    const { status = 200, body } =
      typeof reply === 'function' ? reply(init) : reply;
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}

const secretIn = (calls) =>
  calls.filter(
    ({ url, init }) =>
      url.includes(VALUE) ||
      JSON.stringify(init.headers).includes(VALUE) ||
      (init.body ?? '').includes(VALUE)
  );

test('Worker secret write sends the value only in the body', async () => {
  const { calls, fetchImpl } = provider([
    { match: '/secrets', method: 'PUT', reply: { body: { success: true } } },
  ]);
  await putWorkerSecret({
    token: 't',
    name: 'tuturuuu-abuse-guard',
    binding: 'ABUSE_GUARD_SECRETS',
    value: VALUE,
    fetchImpl,
  });
  assert.equal(calls.length, 1);
  assert.equal(secretIn(calls).length, 1);
  assert.ok((calls[0].init.body ?? '').includes(VALUE));
  assert.ok(!calls[0].url.includes(VALUE));
  assert.ok(calls[0].url.includes(ACCOUNT));
  assert.equal(calls[0].init.redirect, 'error');
});

test('a provider that echoes the value never reaches an error message', async () => {
  const { fetchImpl } = provider([
    {
      match: '/secrets',
      method: 'PUT',
      reply: {
        status: 400,
        body: { errors: [{ code: 10021, message: `bad ${VALUE}` }] },
      },
    },
  ]);
  await assert.rejects(
    putWorkerSecret({
      token: 't',
      name: 'w',
      binding: 'B',
      value: VALUE,
      fetchImpl,
    }),
    (error) =>
      error.message === 'secret write B on w failed with HTTP 400 (codes 10021)'
  );
});

test('malformed values are rejected without being quoted', async () => {
  for (const bad of ['', 'short', `${VALUE}\n`, 'has space '.repeat(8)])
    await assert.rejects(
      putWorkerSecret({
        token: 't',
        name: 'w',
        binding: 'B',
        value: bad,
        fetchImpl: fetch,
      }),
      (error) => !error.message.includes(bad.trim() || '\u0000')
    );
});

test('readback verifiers fail closed', () => {
  const worker = [{ name: 'B', type: 'secret_text' }];
  assert.match(verifyWorkerSecret(worker, 'w', 'B'), /secret_text/);
  assert.throws(() => verifyWorkerSecret([], 'w', 'B'), /exactly one/);
  assert.throws(
    () => verifyWorkerSecret([...worker, ...worker], 'w', 'B'),
    /exactly one/
  );
  assert.throws(
    () => verifyWorkerSecret([{ name: 'B', type: 'plain_text' }], 'w', 'B'),
    /wrong type/
  );
  const id = '123e4567-e89b-12d3-a456-426614174000';
  assert.match(
    verifySupabaseKey([{ name: 'k', id, type: 'secret' }], 'k'),
    /secret/
  );
  assert.throws(
    () => verifySupabaseKey([{ name: 'k', id, type: 'publishable' }], 'k'),
    /wrong type/
  );
  assert.throws(
    () =>
      verifySupabaseKey([{ name: 'k', id: 'not-an-id', type: 'secret' }], 'k'),
    /id shape/
  );
});

test('readBack retries a lagging list and then fails closed', async () => {
  let reads = 0;
  const line = await readBack(
    async () => (++reads < 3 ? [] : [{ name: 'B', type: 'secret_text' }]),
    (entries) => verifyWorkerSecret(entries, 'w', 'B'),
    { attempts: 5, delayMs: 0 }
  );
  assert.match(line, /w: B/);
  reads = 0;
  await assert.rejects(
    readBack(
      async () => (reads++, []),
      (entries) => verifyWorkerSecret(entries, 'w', 'B'),
      {
        attempts: 3,
        delayMs: 0,
      }
    ),
    /exactly one/
  );
  assert.equal(reads, 3, 'bounded attempts');
});

// Target resolution ---------------------------------------------------------

test('targets are fixed per secret and environment', () => {
  const abuse = resolveSharedSecret({
    secret: 'ABUSE_GUARD_SECRET',
    environment: 'production',
    root: here,
  });
  assert.deepEqual(abuse.workers, [
    {
      name: 'tuturuuu-abuse-guard',
      binding: 'ABUSE_GUARD_SECRETS',
      type: 'secret_text',
      group: 'peer',
    },
  ]);
  assert.equal('vercel' in abuse, false);
  const staging = resolveSharedSecret({
    secret: 'ABUSE_GUARD_SECRET',
    environment: 'staging',
    root: here,
  });
  assert.equal(staging.workers[0].name, 'tuturuuu-abuse-guard-staging');
  for (const input of [
    { secret: 'SUPABASE_SECRET_KEY', environment: 'production' },
    { secret: 'ABUSE_GUARD_SECRET', environment: 'dev' },
    { secret: '__proto__', environment: 'production' },
  ])
    assert.throws(() => resolveSharedSecret({ ...input, root: here }));
});

test('family Workers come from the inventory at the checked-out commit', () => {
  const root = mkdtempSync(join(tmpdir(), 'families-'));
  assert.deepEqual(readFamilyWorkers(root), ['tuturuuu-web-api-identity']);
  mkdirSync(join(root, 'apps/web/cloudflare/opennext'), { recursive: true });
  const file = join(root, 'apps/web/cloudflare/opennext/families.json');
  writeFileSync(
    file,
    JSON.stringify({
      families: [
        { id: 'a', worker: 'tuturuuu-web-api-identity' },
        { id: 'b', worker: 'tuturuuu-web-public', auth: false },
        { id: 'c', worker: 'tuturuuu-web-off', enabled: false },
      ],
    })
  );
  assert.deepEqual(readFamilyWorkers(root), [
    'tuturuuu-web-api-identity',
    'tuturuuu-web-public',
  ]);
  assert.deepEqual(readFamilyWorkers(root, { authOnly: true }), [
    'tuturuuu-web-api-identity',
  ]);
  const web = resolveSharedSecret({
    secret: 'WEB_MULTI_ACCOUNT_SESSION_SECRET',
    environment: 'staging',
    root,
  });
  assert.deepEqual(
    web.workers.map(({ name }) => name),
    ['tuturuuu-web-api-identity-staging']
  );
  for (const bad of [
    { families: [{ worker: 'evil/../name' }] },
    { families: [{ worker: 'tuturuuu-web-a' }, { worker: 'tuturuuu-web-a' }] },
    { families: [] },
  ]) {
    writeFileSync(file, JSON.stringify(bad));
    assert.throws(() => readFamilyWorkers(root));
  }
});

test('the repository opts in only the seven approved Supabase key recipients', () => {
  const { families } = JSON.parse(
    readFileSync(join(repoRoot, FAMILIES_FILE), 'utf8')
  );
  const names = families
    .filter(({ supabaseSecret }) => supabaseSecret === true)
    .map(({ worker }) => worker)
    .sort();
  assert.deepEqual(names, [
    'tuturuuu-web-api-auth',
    'tuturuuu-web-api-identity',
    'tuturuuu-web-api-platform',
    'tuturuuu-web-api-workspace',
    'tuturuuu-web-dashboard-core',
    'tuturuuu-web-finance-billing',
    'tuturuuu-web-public-auth',
  ]);
  assert.ok(
    !Object.hasOwn(
      families.find(({ id }) => id === 'public-docs'),
      'supabaseSecret'
    )
  );
});

test('Supabase delivery requires an explicit opt-in and a matching Worker config', () => {
  const root = mkdtempSync(join(tmpdir(), 'supabase-families-'));
  const inventory = join(root, FAMILIES_FILE);
  mkdirSync(dirname(inventory), { recursive: true });
  assert.throws(() => resolveSupabaseFamilyTargets(root), { code: 'ENOENT' });

  const optedIn = {
    id: 'example',
    worker: 'tuturuuu-web-example',
    enabled: false,
    supabaseSecret: true,
  };
  const families = [
    { id: 'public-docs', worker: 'tuturuuu-web-public-docs', enabled: true },
    {
      id: 'other',
      worker: 'tuturuuu-web-other',
      enabled: true,
      supabaseSecret: 'true',
    },
  ];
  writeFileSync(inventory, JSON.stringify({ families }));
  assert.throws(
    () => resolveSupabaseFamilyTargets(root),
    /no families opted in/
  );
  writeFileSync(
    inventory,
    JSON.stringify({ families: [...families, optedIn] })
  );
  assert.throws(
    () => resolveSupabaseFamilyTargets(root),
    /missing family Worker config for example/
  );

  const file = join(dirname(inventory), 'wrangler.example.jsonc');
  const config = {
    name: optedIn.worker,
    account_id: ACCOUNT,
    secrets: { required: ['SUPABASE_SECRET_KEY'] },
  };
  writeFileSync(
    file,
    JSON.stringify({ ...config, name: 'tuturuuu-elsewhere' })
  );
  assert.throws(
    () => resolveSupabaseFamilyTargets(root),
    /does not match its config/
  );
  writeFileSync(file, JSON.stringify({ ...config, secrets: { required: [] } }));
  assert.throws(
    () => resolveSupabaseFamilyTargets(root),
    /require SUPABASE_SECRET_KEY/
  );
  writeFileSync(file, JSON.stringify(config));
  assert.throws(
    () => resolveSupabaseFamilyTargets(root),
    /must disable the Supabase coordination token fallback/
  );
  config.vars = { APP_COORDINATION_TOKEN_DISABLE_SUPABASE_FALLBACK: '1' };
  writeFileSync(file, '// production family config\n' + JSON.stringify(config));
  assert.deepEqual(resolveSupabaseFamilyTargets(root).workers, [
    {
      name: optedIn.worker,
      binding: 'SUPABASE_SECRET_KEY',
      type: 'secret_text',
    },
  ]);
});

// CLI flows -----------------------------------------------------------------

function capture() {
  const lines = [];
  return { lines, log: (line) => lines.push(line) };
}

test('shared-secret write and verify print names and types only', async () => {
  const plan = resolveSharedSecret({
    secret: 'ABUSE_GUARD_SECRET',
    environment: 'production',
    root: here,
  });
  const { calls, fetchImpl } = provider([
    { match: '/secrets', method: 'PUT', reply: { body: { success: true } } },
    {
      match: '/secrets',
      reply: {
        body: {
          result: [{ name: 'ABUSE_GUARD_SECRETS', type: 'secret_text' }],
        },
      },
    },
  ]);
  const env = { CLOUDFLARE_API_TOKEN: 'cf' };
  const out = capture();
  await sharedSecret.writeWorkers(plan, VALUE, {
    env,
    fetchImpl,
    log: out.log,
  });
  await sharedSecret.verify(plan, {
    env,
    fetchImpl,
    log: out.log,
    retry: { attempts: 1, delayMs: 0 },
  });
  assert.equal(out.lines.length, 2);
  assert.ok(!out.lines.join('\n').includes(VALUE));
  assert.equal(secretIn(calls).length, 1, 'only the write body carries it');
  assert.ok(
    calls.every(({ url }) => url.startsWith('https://api.cloudflare.com/'))
  );
  assert.ok(out.lines.at(-1).includes('(secret_text)'));
});

test('verify fails when a Worker holds an unexpected secret type', async () => {
  const plan = resolveSharedSecret({
    secret: 'ABUSE_GUARD_SECRET',
    environment: 'production',
    root: here,
  });
  const { fetchImpl } = provider([
    {
      match: '/secrets',
      reply: {
        body: { result: [{ name: 'ABUSE_GUARD_SECRETS', type: 'plain_text' }] },
      },
    },
  ]);
  await assert.rejects(
    sharedSecret.verify(plan, {
      env: { CLOUDFLARE_API_TOKEN: 'cf' },
      fetchImpl,
      log: () => {},
      retry: { attempts: 1, delayMs: 0 },
    }),
    /wrong type/
  );
});

test('preflight refuses a missing Worker before any write', async () => {
  const plan = resolveSharedSecret({
    secret: 'ABUSE_GUARD_SECRET',
    environment: 'production',
    root: here,
  });
  const { calls, fetchImpl } = provider([]);
  await assert.rejects(
    sharedSecret.preflight(plan, {
      env: { CLOUDFLARE_API_TOKEN: 'cf' },
      fetchImpl,
      log: () => {},
    }),
    /does not exist/
  );
  assert.ok(calls.every(({ init }) => (init.method ?? 'GET') === 'GET'));
});

const KEY_ENV = { CLOUDFLARE_API_TOKEN: 'cf', SUPABASE_ACCESS_TOKEN: 'sb' };
const keyPlan = {
  projectRef: 'nzamlzqfdwaaxdefwraj',
  keyName: 'cf-web-families',
  workers: [
    {
      name: 'tuturuuu-web-api-identity',
      binding: 'SUPABASE_SECRET_KEY',
      type: 'secret_text',
    },
  ],
};

test('a second family key is never created', async () => {
  const { calls, fetchImpl } = provider([
    {
      match: 'api-keys',
      reply: {
        body: [
          {
            name: 'cf-web-families',
            id: '123e4567-e89b-12d3-a456-426614174000',
            type: 'secret',
          },
        ],
      },
    },
  ]);
  await assert.rejects(
    familyKey.create(keyPlan, { env: KEY_ENV, fetchImpl }),
    /no second key/
  );
  assert.ok(calls.every(({ init }) => (init.method ?? 'GET') === 'GET'));
  assert.ok(calls.every(({ url }) => url.includes('reveal=false')));
});

test('family key creation reveals the value once and writes it by stdin only', async () => {
  const { calls, fetchImpl } = provider([
    { match: 'api-keys', method: 'POST', reply: { body: { api_key: VALUE } } },
    {
      match: 'api-keys',
      reply: { body: [{ name: 'other', id: 'x', type: 'publishable' }] },
    },
    { match: '/secrets', method: 'PUT', reply: { body: { success: true } } },
  ]);
  const value = await familyKey.create(keyPlan, { env: KEY_ENV, fetchImpl });
  assert.equal(value, VALUE);
  const out = capture();
  await familyKey.put(keyPlan, value, {
    env: KEY_ENV,
    fetchImpl,
    log: out.log,
  });
  assert.ok(!out.lines.join('\n').includes(VALUE));
  const carriers = secretIn(calls).map(({ init }) => init.method);
  assert.deepEqual(
    carriers,
    ['PUT'],
    'only the Worker write carries the value'
  );
  assert.ok(!calls.some(({ url }) => url.includes(VALUE)));
});

test('family key readback prints key name, id and type, and each Worker secret', async () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  const { fetchImpl } = provider([
    {
      match: 'api-keys',
      reply: { body: [{ name: 'cf-web-families', id, type: 'secret' }] },
    },
    {
      match: '/secrets',
      reply: {
        body: {
          result: [{ name: 'SUPABASE_SECRET_KEY', type: 'secret_text' }],
        },
      },
    },
  ]);
  const out = capture();
  await familyKey.verify(keyPlan, {
    env: KEY_ENV,
    fetchImpl,
    log: out.log,
    retry: { attempts: 1, delayMs: 0 },
  });
  assert.deepEqual(out.lines, [
    `supabase key cf-web-families id ${id} (secret)`,
    'tuturuuu-web-api-identity: SUPABASE_SECRET_KEY (secret_text)',
  ]);
});

test('revoke deletes only the matching secret key and reads absence back', async () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  const key = { name: keyPlan.keyName, id, type: 'secret' };
  const other = { ...key, name: 'another-family' };
  let listed = [key, { ...other, id: 'a23e4567-e89b-12d3-a456-426614174000' }];
  const { fetchImpl, calls } = provider([
    { match: 'api-keys', reply: () => ({ body: listed }) },
    {
      match: id,
      method: 'DELETE',
      reply: () => {
        listed = listed.slice(1);
        return { body: { ...key, api_key: VALUE } };
      },
    },
  ]);
  const out = capture();
  await familyKey.revoke({
    env: KEY_ENV,
    fetchImpl,
    log: out.log,
    retry: { attempts: 1 },
  });
  assert.deepEqual(
    calls.map(({ init }) => init.method),
    ['GET', 'DELETE', 'GET']
  );
  assert.equal(
    calls[1].url,
    `https://api.supabase.com/v1/projects/${keyPlan.projectRef}/api-keys/${id}?reveal=false`
  );
  assert.equal(calls[1].init.body, undefined);
  assert.deepEqual(out.lines, ['key cf-web-families revoked']);
});

test('revoke is a no-op when absent and refuses ambiguous or invalid matches', async () => {
  const key = {
    name: keyPlan.keyName,
    id: '123e4567-e89b-12d3-a456-426614174000',
    type: 'secret',
  };
  for (const [keys, refusal] of [
    [[], null],
    [[key, key], /exactly one entry/],
    [[{ ...key, type: 'publishable' }], /wrong type/],
    [[{ ...key, id: 'invalid-id' }], /unexpected id shape/],
  ]) {
    const { fetchImpl, calls } = provider([
      { match: 'api-keys', reply: { body: keys } },
    ]);
    const options = { env: KEY_ENV, fetchImpl, log: () => {} };
    if (refusal) await assert.rejects(familyKey.revoke(options), refusal);
    else await familyKey.revoke(options);
    assert.deepEqual(
      calls.map(({ init }) => init.method),
      ['GET']
    );
  }
});
test('the real CLIs never print a value they were given', () => {
  for (const args of [
    [
      'scripts/ci/shared-secret.mjs',
      'write',
      'workers',
      'ABUSE_GUARD_SECRET',
      'production',
    ],
    [
      'scripts/ci/shared-secret.mjs',
      'write',
      'vercel',
      'ABUSE_GUARD_SECRET',
      'staging',
    ],
    ['scripts/ci/supabase-family-key.mjs', 'put'],
  ]) {
    for (const input of [VALUE, `${VALUE} extra`, VALUE.slice(0, 10)]) {
      const run = spawnSync(process.execPath, args, {
        cwd: repoRoot,
        input,
        encoding: 'utf8',
        env: { PATH: process.env.PATH },
      });
      assert.notEqual(run.status, 0, 'no credentials: must fail');
      assert.ok(!`${run.stdout}${run.stderr}`.includes(VALUE.slice(0, 10)));
      assert.ok(!args.some((arg) => arg.includes(VALUE.slice(0, 10))));
    }
  }
});
