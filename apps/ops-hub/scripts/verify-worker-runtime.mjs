import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { startCfViteWorker } from '../../../scripts/ci/cf-vite-worker.mjs';
import {
  ASSERTION_HEADER,
  base64,
  PUBLISHER_USER_HEADER,
  publisherMessage,
  SIGNATURE_HEADER,
  signAssertion,
} from '../src/protocol.ts';

const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const gateway = 'runtime-fixture-only-gateway-value-at-least-43-chars';
let server;
let keys;
const headers = async (
  target,
  method = 'GET',
  id = user,
  time = Date.now()
) => ({
  [ASSERTION_HEADER]: await signAssertion(gateway, id, method, target, time),
});
async function read(target, method = 'GET', id = user) {
  return server.fetch(target, {
    method,
    headers: await headers(target, method, id),
  });
}
async function ingest(body, id = user, key = keys.privateKey) {
  const bytes = new TextEncoder().encode(
    typeof body === 'string' ? body : JSON.stringify(body)
  );
  return server.fetch('/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [PUBLISHER_USER_HEADER]: id,
      [SIGNATURE_HEADER]: base64(
        await crypto.subtle.sign('Ed25519', key, publisherMessage(id, bytes))
      ),
    },
    body: bytes,
  });
}
const envelope = (seq, extra = {}) => ({
  v: 2,
  seq,
  sentAt: Date.now(),
  events: [],
  ...extra,
});
const snapshot = () => ({
  needsYou: [],
  environments: ['production', 'staging'].map((environment) => ({
    product: 'tuturuuu',
    environment,
    lastRelease: Date.now(),
    version: 'v1',
    shortSha: 'abc1234',
    commitSubject: 'fix: RLS private detail',
    deployState: 'held',
    ciState: 'success',
  })),
  lanes: [],
  backlog: [],
});
const sql = (query, params = [], id = user) =>
  server.durableObjectSql('OpsHub', `hub:${id}`, query, params);
before(async () => {
  keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  server = await startCfViteWorker({
    root: fileURLToPath(new URL('..', import.meta.url)),
    mode: 'source',
    secrets: {
      OPS_HUB_GATEWAY_SECRET: gateway,
      OPS_HUB_PUBLISHER_PUBLIC_KEY: base64(
        await crypto.subtle.exportKey('raw', keys.publicKey)
      ),
      OPS_HUB_ALLOWED_USER_IDS: `${user},${other}`,
    },
  });
});
after(async () => {
  await server?.close();
});

test('rejects anonymous, forged, expired and cross-target assertions before storage', async () => {
  assert.equal((await server.fetch('/snapshot')).status, 404);
  assert.equal(
    (
      await server.fetch('/snapshot', {
        headers: { [ASSERTION_HEADER]: 'forged' },
      })
    ).status,
    404
  );
  assert.equal(
    (
      await server.fetch('/snapshot', {
        headers: await headers('/snapshot', 'GET', user, Date.now() - 61_000),
      })
    ).status,
    404
  );
  assert.equal(
    (await server.fetch('/snapshot', { headers: await headers('/status') }))
      .status,
    404
  );
  assert.equal(
    (await read('/status', 'GET', '33333333-3333-4333-8333-333333333333'))
      .status,
    404
  );
});
test('checks Ed25519, unknown fields, clock skew and streamed size caps', async () => {
  const forged = await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ]);
  assert.equal(
    (await ingest(envelope(1), user, forged.privateKey)).status,
    404
  );
  assert.equal(
    (await ingest(envelope(1, { sentAt: Date.now() - 120_100 }))).status,
    400
  );
  assert.equal(
    (await ingest(envelope(1, { sentAt: Date.now() + 121_000 }))).status,
    400
  );
  assert.equal((await ingest(envelope(1, { raw: 'no' }))).status, 400);
  assert.equal((await ingest('x'.repeat(256 * 1024 + 1))).status, 413);
  assert.equal(
    (await ingest(envelope(1, { snapshot: { ...snapshot(), raw: 'no' } })))
      .status,
    400
  );
  assert.deepEqual((await (await read('/status')).json()).seq, 0);
});
test('persists sanitized environments and monotonic replay protection across restart', async () => {
  const event = {
    seq: 1,
    ts: Date.now(),
    kind: 'shipped',
    product: 'tuturuuu',
    severity: 'info',
    title: 'Release shipped',
  };
  assert.equal(
    (await ingest(envelope(1, { snapshot: snapshot(), events: [event] })))
      .status,
    200
  );
  assert.equal((await ingest(envelope(1))).status, 409);
  assert.equal((await ingest(envelope(2, { events: [event] }))).status, 400);
  assert.equal((await read('/events?after=0')).status, 200);
  assert.equal((await (await read('/events?after=1')).json()).events.length, 0);
  assert.deepEqual(
    (await (await read('/environments')).json()).map((e) => [
      e.environment,
      e.commitSubject,
    ]),
    [
      ['production', 'Security fix'],
      ['staging', 'Security fix'],
    ]
  );
  assert.deepEqual(await (await read('/snapshot', 'GET', other)).json(), null);
  await server.restart();
  assert.equal((await ingest(envelope(1))).status, 409);
});
test('bounds total event rows, hourly ingests and read/export retention', async () => {
  await sql('UPDATE flags SET ingests=120');
  assert.equal((await ingest(envelope(2))).status, 429);
  assert.deepEqual(await sql('SELECT seq FROM flags'), [{ seq: 1 }]);
  await sql('UPDATE flags SET ingests=1');
  await sql('UPDATE events SET ts=?', [Date.now() - 31 * 86_400_000]);
  assert.equal((await (await read('/events')).json()).events.length, 0);
  assert.equal(
    (await (await read('/hub/export?section=events')).json()).rows.length,
    0
  );
  assert.equal((await ingest(envelope(2))).status, 200);
  assert.deepEqual(await sql('SELECT COUNT(*) AS count FROM events'), [
    { count: 0 },
  ]);
  await sql('UPDATE flags SET lastPublisherAt=?', [Date.now() - 16 * 60_000]);
  assert.equal((await (await read('/status')).json()).publisherStale, true);
});
test('caps persisted events and accepts only one concurrent copy of a sequence', async () => {
  for (let batch = 0; batch < 11; batch++) {
    const body = envelope(3 + batch, {
      events: Array.from({ length: 100 }, (_, index) => ({
        seq: 2 + batch * 100 + index,
        ts: Date.now(),
        kind: 'shipped',
        product: 'tuturuuu',
        severity: 'info',
        title: 'Release shipped',
      })),
    });
    if (batch === 0) {
      const responses = await Promise.all(
        Array.from({ length: 4 }, () => ingest(body))
      );
      assert.deepEqual(
        responses.map((r) => r.status).sort(),
        [200, 409, 409, 409]
      );
    } else assert.equal((await ingest(body)).status, 200);
  }
  assert.deepEqual(await sql('SELECT COUNT(*) AS count FROM events'), [
    { count: 1000 },
  ]);
  assert.equal((await (await read('/events')).json()).events.length, 200);
  let after = 0;
  let exported = 0;
  for (let page = 0; page < 6; page++) {
    const result = await (
      await read(`/hub/export?section=events&after=${after}&seq=13`)
    ).json();
    assert.ok(result.rows.length <= 200);
    exported += result.rows.length;
    if (result.nextAfter === null) break;
    assert.ok(result.nextAfter > after);
    after = result.nextAfter;
  }
  assert.equal(exported, 1000);
});
test('erases isolated data and leaves a durable disabled replay tombstone', async () => {
  assert.equal(
    (await ingest(envelope(1, { snapshot: snapshot() }), other)).status,
    200
  );
  assert.equal((await read('/hub', 'DELETE', other)).status, 200);
  assert.deepEqual(
    await sql('SELECT COUNT(*) AS count FROM snapshot', [], other),
    [{ count: 0 }]
  );
  assert.equal((await ingest(envelope(2), other)).status, 503);
  assert.equal(
    (await (await read('/status', 'GET', other)).json()).enabled,
    false
  );
});
test('v2 persists only approved decision fields and bounds/downsamples observation reads', async () => {
  const at = Date.now() - 120_000;
  const normal = {
    id: 'normal',
    at,
    title: 'Move release',
    by: 'mastermind',
    category: 'auto',
    area: 'release',
    why: 'Dependency ready',
    risk: 'low',
    reversible: true,
  };
  const security = {
    ...normal,
    id: 'privacy',
    title: 'Review policy',
    area: 'security',
    why: 'Must not survive storage',
  };
  const observability = {
    quota_series: [
      { instance: 'main', t: at, pct: 80 },
      { instance: 'main', t: at + 1, pct: 20 },
    ],
    speed_series: [{ model: 'gpt-6', t: at, tok_s_p50: 30 }],
    children_series: ['codex', 'claude'].map((provider) => ({
      t: at,
      provider,
      model: 'shared-model',
      running: 1,
      started: 2,
      finished: 1,
    })),
    staff: [
      {
        role: 'release-desk',
        title: 'Release Desk',
        state: 'waiting',
        last_active: at,
        model: 'gpt-6',
        runs_today: 3,
      },
    ],
    ci: [{ repo: 'tutur3u/platform', t: at, queued: 2, running: 1 }],
    cadence: [{ product: 'tuturuuu', last_prod_at: at }],
  };
  assert.equal(
    (
      await ingest(
        envelope(14, { decisions: [normal, security], observability })
      )
    ).status,
    200
  );
  const decisions = await (await read('/decisions')).json();
  assert.equal(decisions.decisions.length, 2);
  assert.deepEqual(Object.keys(decisions.decisions[1]).sort(), [
    'area',
    'at',
    'id',
    'risk',
    'title',
  ]);
  assert.deepEqual(
    (await (await read('/decisions?category=auto')).json()).decisions.map(
      (row) => row.id
    ),
    ['normal']
  );
  assert.deepEqual(
    (await (await read(`/decisions?after=${at}:normal`)).json()).decisions.map(
      (row) => row.id
    ),
    ['privacy']
  );
  const stored = await sql('SELECT data,category FROM decisions WHERE id=?', [
    'privacy',
  ]);
  assert.equal(stored[0].category, null);
  assert.deepEqual(Object.keys(JSON.parse(stored[0].data)).sort(), [
    'area',
    'at',
    'id',
    'risk',
    'title',
  ]);
  const quota = await (await read('/observability?series=quota_series')).json();
  assert.equal(quota.points.length, 1);
  assert.equal(quota.points[0].pct, 20);
  assert.equal(quota.points[0].t % 120_000, 0);
  assert.equal(
    (await (await read('/observability?series=children_series')).json()).points
      .length,
    2
  );
  assert.equal(
    (await (await read('/observability?series=staff')).json()).points[0].role,
    'release-desk'
  );
  assert.equal(
    (
      await ingest(
        envelope(15, { observability: { ...observability, raw: 'no' } })
      )
    ).status,
    400
  );
  assert.equal(
    (
      await ingest(
        envelope(15, {
          observability: {
            ...observability,
            quota_series: Array.from({ length: 17 }, (_, i) => ({
              instance: `pool-${i}`,
              t: at,
              pct: 40,
            })),
          },
        })
      )
    ).status,
    400
  );
  const now = Date.now();
  await sql(
    `WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<5040)
    INSERT OR REPLACE INTO metrics(series,dimension,t,data)
    SELECT 'quota_series','history',?-x*120000,json_object('instance','history','t',?-x*120000,'pct',50) FROM n`,
    [now, now]
  );
  await sql(
    'INSERT INTO metric_dimensions(series,dimension,lastAt) VALUES(?,?,?)',
    ['quota_series', 'history', now]
  );
  await sql(
    "UPDATE metric_counts SET cnt=(SELECT COUNT(*) FROM metrics WHERE series='quota_series') WHERE series='quota_series'"
  );
  const sampled = await (
    await read('/observability?series=quota_series')
  ).json();
  assert.ok(sampled.points.length <= 500 && sampled.points.length < 5040);
  assert.equal(sampled.pointCap, 500);
  assert.ok(sampled.points.every((row) => row.t > now - 7 * 86_400_000));
  await sql('UPDATE metrics SET t=? WHERE dimension=?', [
    now - 8 * 86_400_000,
    'main',
  ]);
  assert.ok(
    !(
      await (await read('/observability?series=quota_series')).json()
    ).points.some((row) => row.instance === 'main')
  );
  assert.equal(
    (
      await ingest(
        envelope(15, {
          observability: {
            ...observability,
            staff: [{ ...observability.staff[0], role: 'new-role' }],
            cadence: [],
          },
        })
      )
    ).status,
    200
  );
  assert.deepEqual(
    (await (await read('/observability?series=staff')).json()).points.map(
      (row) => row.role
    ),
    ['new-role']
  );
  assert.deepEqual(
    (await (await read('/observability?series=cadence')).json()).points,
    []
  );
  const counters = await sql(
    "SELECT cnt FROM metric_counts WHERE series='quota_series'"
  );
  const actual = await sql(
    "SELECT COUNT(*) AS cnt FROM metrics WHERE series='quota_series'"
  );
  assert.deepEqual(counters, actual);
  await sql(
    "CREATE TRIGGER fail_ingest BEFORE INSERT ON metrics WHEN NEW.dimension='failure-fixture' BEGIN SELECT RAISE(ABORT,'fixture-failure'); END"
  );
  assert.equal(
    (
      await ingest(
        envelope(16, {
          observability: {
            ...observability,
            quota_series: [{ instance: 'failure-fixture', t: at, pct: 50 }],
          },
        })
      )
    ).status,
    400
  );
  assert.deepEqual(await sql('SELECT seq FROM flags'), [{ seq: 15 }]);
  assert.deepEqual(
    await sql(
      "SELECT COUNT(*) AS count FROM metric_dimensions WHERE dimension='failure-fixture'"
    ),
    [{ count: 0 }]
  );
  assert.deepEqual(
    await sql("SELECT cnt FROM metric_counts WHERE series='quota_series'"),
    actual
  );
  await sql('DROP TRIGGER fail_ingest');
  await server.restart();
  assert.equal((await ingest(envelope(16, { observability }))).status, 200);
  assert.deepEqual(
    await sql("SELECT cnt FROM metric_counts WHERE series='quota_series'"),
    actual
  );
  assert.deepEqual(
    await sql(
      "SELECT COUNT(*) AS cnt FROM metrics WHERE series='quota_series'"
    ),
    actual
  );
  const page = await (await read('/hub/export?section=metrics')).json();
  assert.equal(page.rows.length, 200);
  assert.ok(page.nextAfter > 0);
  assert.equal((await read('/hub/export?section=metrics&seq=14')).status, 409);
});
test('kill switch survives restart, denies ingest and all reads except status', async () => {
  assert.equal(
    (
      await ingest(
        envelope(17, { snapshot: { ...snapshot(), enabled: false } })
      )
    ).status,
    200
  );
  await server.restart();
  for (const target of [
    '/snapshot',
    '/events',
    '/needs-you',
    '/environments',
    '/hub/export',
  ]) {
    assert.equal((await read(target)).status, 503);
  }
  assert.equal((await ingest(envelope(18))).status, 503);
  assert.equal((await (await read('/status')).json()).enabled, false);
  for (const table of [
    'snapshot',
    'events',
    'needs_you',
    'decisions',
    'metrics',
    'metric_dimensions',
    'metric_counts',
    'observability_snapshot',
  ]) {
    assert.deepEqual(await sql(`SELECT COUNT(*) AS count FROM ${table}`), [
      { count: 0 },
    ]);
  }
  assert.deepEqual(await sql('SELECT seq,enabled FROM flags'), [
    { seq: 17, enabled: 0 },
  ]);
});
