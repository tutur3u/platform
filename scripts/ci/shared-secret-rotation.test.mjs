// Copy scope, activated vinext Workers and the offline rotation plan of the shared
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
  readVinextWorkers,
  VINEXT_FAMILIES_FILE,
  resolveSharedSecret,
  SHARED_SECRETS,
} from './shared-secret-targets.mjs';

const VALUE = 'Zk9Qd2xjTnJ0eUh2bUJxMVd6U2Y4a0xwRDNhRzVqVXhNYzJPdkVuQTdyS2g=';

function inventory(families) {
  const root = mkdtempSync(join(tmpdir(), 'vinext-'));
  mkdirSync(join(root, 'apps/web/cloudflare/vinext'), { recursive: true });
  writeFileSync(join(root, VINEXT_FAMILIES_FILE), JSON.stringify({ families }));
  return root;
}

const ROOT = inventory([
  {
    id: 'public-auth',
    worker: 'tuturuuu-web-vinext-public-auth',
    activated: true,
  },
  { id: 'api-core', worker: 'tuturuuu-web-vinext-api-core', activated: true },
  {
    id: 'dashboard',
    worker: 'tuturuuu-web-vinext-dashboard',
    activated: false,
  },
  { id: 'web-rest', worker: 'tuturuuu-web-vinext-web-rest' },
]);

test('vinext Workers come only from activated families', () => {
  assert.deepEqual(readVinextWorkers(ROOT), [
    'tuturuuu-web-vinext-public-auth',
    'tuturuuu-web-vinext-api-core',
  ]);
  assert.deepEqual(readVinextWorkers(mkdtempSync(join(tmpdir(), 'none-'))), []);
  for (const bad of [
    [{ id: 'Bad Id', activated: true }],
    [{ id: 'a', worker: 'tuturuuu-web-other', activated: true }],
    [
      { id: 'a', activated: true },
      { id: 'a', activated: true },
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
      ['tuturuuu-web-vinext-public-auth', 'MEET_REALTIME_TOKEN_SECRET', 'web'],
      ['tuturuuu-web-vinext-api-core', 'MEET_REALTIME_TOKEN_SECRET', 'web'],
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
      ['tuturuuu-web-vinext-public-auth', 'ABUSE_GUARD_SECRET', 'web'],
      ['tuturuuu-web-vinext-api-core', 'ABUSE_GUARD_SECRET', 'web'],
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

test('a web-scope copy touches only web Workers on Cloudflare', async () => {
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
  assert.equal(sharedSecret.writeVercel, undefined);
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
  assert.match(text, /users notice: /);
  assert.doesNotMatch(text, /vercel/i);
  assert.doesNotMatch(text, /fallback/i);
});

test('the coordination token reaches every sender in one mint', async () => {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(line);
  try {
    await sharedSecret.main(
      ['plan', 'CLOUDFLARE_COORDINATION_TOKEN', 'production'],
      {
        env: {},
        fetchImpl: () => assert.fail('plan must not call a provider'),
      }
    );
  } finally {
    console.log = original;
  }
  const text = lines.join('\n');
  assert.match(text, /peer tuturuuu-coordination: COORDINATION_TOKEN/);
  assert.match(
    text,
    /sender tuturuuu-infrastructure: CLOUDFLARE_COORDINATION_TOKEN/
  );
  assert.match(text, /sender tuturuuu-calendar: CLOUDFLARE_COORDINATION_TOKEN/);
  assert.doesNotMatch(text, /also update: /);
  assert.doesNotMatch(text, /vercel/i);
  const web = resolveSharedSecret({
    secret: 'CLOUDFLARE_COORDINATION_TOKEN',
    environment: 'production',
    root: ROOT,
    scope: 'web',
  });
  assert.ok(web.workers.every(({ group }) => group === 'web'));
});

test('the infrastructure cron secret reaches Cron Control, Admin and Calendar in one mint', async () => {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(line);
  try {
    await sharedSecret.main(
      ['plan', 'CRON_SECRET_INFRASTRUCTURE', 'production'],
      {
        env: {},
        fetchImpl: () => assert.fail('plan must not call a provider'),
      }
    );
  } finally {
    console.log = original;
  }
  const text = lines.join('\n');
  assert.match(
    text,
    /sender tuturuuu-cron-control: CRON_SECRET_INFRASTRUCTURE/
  );
  assert.match(text, /peer tuturuuu-infrastructure: CRON_SECRET/);
  assert.match(text, /peer tuturuuu-calendar: CRON_SECRET/);
  const resolved = resolveSharedSecret({
    secret: 'CRON_SECRET_INFRASTRUCTURE',
    environment: 'production',
    root: ROOT,
    scope: 'all',
  });
  assert.deepEqual(
    resolved.workers.map(({ name, binding }) => `${name} ${binding}`).sort(),
    [
      'tuturuuu-calendar CRON_SECRET',
      'tuturuuu-cron-control CRON_SECRET_INFRASTRUCTURE',
      'tuturuuu-infrastructure CRON_SECRET',
    ]
  );
  assert.throws(() =>
    resolveSharedSecret({
      secret: 'CRON_SECRET_INFRASTRUCTURE',
      environment: 'staging',
      root: ROOT,
      scope: 'all',
    })
  );
});

test('the committed vinext table lists the live family Workers', () => {
  const workers = readVinextWorkers(join(import.meta.dirname, '../..'));
  assert.ok(workers.includes('tuturuuu-web-vinext-public-auth'));
  assert.ok(
    workers.every((worker) => worker.startsWith('tuturuuu-web-vinext-'))
  );
});
