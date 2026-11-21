// Copy scope, vinext opt-in and the offline rotation plan of the shared
// secret tooling. The original write path is covered by
// shared-secret-scripts.test.mjs; the workflows by shared-secret-write.test.mjs.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ROTATION } from './shared-secret-rotation.mjs';
import * as sharedSecret from './shared-secret.mjs';
import {
  FAMILIES_FILE,
  readVinextWorkers,
  resolveSharedSecret,
  SHARED_SECRETS,
} from './shared-secret-targets.mjs';

const VALUE = 'Zk9Qd2xjTnJ0eUh2bUJxMVd6U2Y4a0xwRDNhRzVqVXhNYzJPdkVuQTdyS2g=';

function inventory(families) {
  const root = mkdtempSync(join(tmpdir(), 'vinext-'));
  mkdirSync(join(root, 'apps/web/cloudflare/opennext'), { recursive: true });
  writeFileSync(join(root, FAMILIES_FILE), JSON.stringify({ families }));
  return root;
}

const ROOT = inventory([
  { id: 'public-docs', worker: 'tuturuuu-web-public-docs', vinext: true },
  {
    id: 'api-identity',
    worker: 'tuturuuu-web-api-identity',
    enabled: false,
    vinext: true,
  },
  { id: 'dashboard-core', worker: 'tuturuuu-web-dashboard-core' },
]);

test('vinext Workers come only from families that opt in', () => {
  assert.deepEqual(readVinextWorkers(ROOT), [
    'tuturuuu-web-vinext-public-docs',
    'tuturuuu-web-vinext-api-identity',
  ]);
  assert.deepEqual(readVinextWorkers(mkdtempSync(join(tmpdir(), 'none-'))), []);
  for (const bad of [
    [{ id: 'Bad Id', vinext: true }],
    [
      { id: 'a', vinext: true },
      { id: 'a', vinext: true },
    ],
  ])
    assert.throws(() => readVinextWorkers(inventory(bad)));
});

test('every secret has rotation facts and a fixed mode', () => {
  for (const [name, entry] of Object.entries(SHARED_SECRETS)) {
    assert.ok(ROTATION[name], `${name} has no rotation facts`);
    assert.ok(['mint', 'copy', 'operator-copy'].includes(entry.mode));
  }
  const copy = resolveSharedSecret({
    secret: 'MEET_REALTIME_TOKEN_SECRET',
    environment: 'production',
    root: ROOT,
    scope: 'web',
  });
  assert.equal(copy.mode, 'copy');
  assert.deepEqual(
    copy.workers.map(({ name, binding, group }) => [name, binding, group]),
    [
      ['tuturuuu-web-vinext-public-docs', 'MEET_REALTIME_TOKEN_SECRET', 'web'],
      ['tuturuuu-web-vinext-api-identity', 'MEET_REALTIME_TOKEN_SECRET', 'web'],
    ]
  );
  assert.throws(
    () =>
      resolveSharedSecret({
        secret: 'MEET_REALTIME_TOKEN_SECRET',
        environment: 'staging',
        root: ROOT,
      }),
    /no staging destinations/
  );
  assert.throws(() =>
    resolveSharedSecret({
      secret: 'ABUSE_GUARD_SECRET',
      environment: 'production',
      scope: 'peers',
    })
  );
});

test('the guard secret keeps its plural binding and adds web Workers', () => {
  const all = resolveSharedSecret({
    secret: 'ABUSE_GUARD_SECRET',
    environment: 'production',
    root: ROOT,
  });
  assert.deepEqual(
    all.workers.map(({ name, binding, group }) => [name, binding, group]),
    [
      ['tuturuuu-abuse-guard', 'ABUSE_GUARD_SECRETS', 'peer'],
      ['tuturuuu-web-vinext-public-docs', 'ABUSE_GUARD_SECRET', 'web'],
      ['tuturuuu-web-vinext-api-identity', 'ABUSE_GUARD_SECRET', 'web'],
    ]
  );
  const coordination = resolveSharedSecret({
    secret: 'CLOUDFLARE_COORDINATION_TOKEN',
    environment: 'production',
    root: ROOT,
  });
  assert.equal(coordination.workers[0].binding, 'COORDINATION_TOKEN');
  const pepper = resolveSharedSecret({
    secret: 'ABUSE_GUARD_KEY_PEPPER',
    environment: 'production',
    root: ROOT,
  });
  assert.deepEqual(
    pepper.workers
      .filter(({ group }) => group === 'peer')
      .map(({ name }) => name),
    ['tuturuuu-cms', 'tuturuuu-nova', 'tuturuuu-rewise']
  );
});

function cloudflare() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? 'GET',
      body: init.body,
    });
    if (String(url).endsWith('/settings')) return new Response('{}');
    if ((init.method ?? 'GET') === 'PUT')
      return new Response(JSON.stringify({ success: true }));
    const name = String(url).includes('vinext')
      ? 'MEET_REALTIME_TOKEN_SECRET'
      : 'X';
    return new Response(
      JSON.stringify({ result: [{ name, type: 'secret_text' }] })
    );
  };
  return { calls, fetchImpl };
}

const ENV = { CLOUDFLARE_API_TOKEN: 'cf-token' };

test('a web-scope copy touches only web Workers and never Vercel', async () => {
  const plan = resolveSharedSecret({
    secret: 'MEET_REALTIME_TOKEN_SECRET',
    environment: 'production',
    root: ROOT,
    scope: 'web',
  });
  const { calls, fetchImpl } = cloudflare();
  const log = () => {};
  await sharedSecret.preflight(plan, { env: ENV, fetchImpl, log });
  await sharedSecret.writeWorkers(plan, VALUE, { env: ENV, fetchImpl, log });
  await sharedSecret.verify(plan, {
    env: ENV,
    fetchImpl,
    log,
    retry: { attempts: 1, delayMs: 0 },
  });
  assert.ok(calls.every(({ url }) => url.includes('api.cloudflare.com')));
  assert.ok(calls.every(({ url }) => url.includes('tuturuuu-web-vinext-')));
  assert.equal(calls.filter(({ method }) => method === 'PUT').length, 2);
  await assert.rejects(
    sharedSecret.writeVercel(plan, VALUE, { env: ENV, fetchImpl, log }),
    /not minted here/
  );
});

test('scope all is only for minted values, and copies need a web Worker', async () => {
  const log = () => {};
  const { fetchImpl } = cloudflare();
  const copyAll = resolveSharedSecret({
    secret: 'CRON_CONTROL_DELIVERY_TOKEN',
    environment: 'production',
    root: ROOT,
  });
  await assert.rejects(
    sharedSecret.writeWorkers(copyAll, VALUE, { env: ENV, fetchImpl, log }),
    /copy it with scope web/
  );
  const empty = resolveSharedSecret({
    secret: 'CRON_CONTROL_DELIVERY_TOKEN',
    environment: 'production',
    root: mkdtempSync(join(tmpdir(), 'none-')),
    scope: 'web',
  });
  await assert.rejects(
    sharedSecret.preflight(empty, { env: ENV, fetchImpl, log }),
    /opt the vinext families in first/
  );
});

test('plan prints destinations and notes offline, without credentials', async () => {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(line);
  try {
    await sharedSecret.main(
      ['plan', 'WEB_MULTI_ACCOUNT_SESSION_SECRET', 'production'],
      {
        env: {},
        fetchImpl: () => assert.fail('plan must not call a provider'),
      }
    );
  } finally {
    console.log = original;
  }
  const text = lines.join('\n');
  assert.match(text, /mode mint, scope all/);
  assert.match(text, /vercel WEB_MULTI_ACCOUNT_SESSION_SECRET -> production/);
  assert.match(text, /users notice: /);
  assert.match(text, /passive archive/);
  assert.match(text, /Never instantly roll Vercel back/);
  assert.doesNotMatch(text, /fallback/i);
});
