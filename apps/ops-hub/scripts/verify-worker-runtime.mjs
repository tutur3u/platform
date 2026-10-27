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
  v: 1,
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
  assert.equal((await (await read('/hub/export')).json()).events.length, 0);
  assert.equal((await ingest(envelope(2))).status, 200);
  assert.deepEqual(await sql('SELECT COUNT(*) AS count FROM events'), [
    { count: 0 },
  ]);
  await sql('UPDATE flags SET lastPublisherAt=?', [Date.now() - 16 * 60_000]);
  assert.equal((await (await read('/status')).json()).publisherStale, true);
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
test('kill switch survives restart, denies ingest and all reads except status', async () => {
  assert.equal(
    (await ingest(envelope(3, { snapshot: { ...snapshot(), enabled: false } })))
      .status,
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
  assert.equal((await ingest(envelope(4))).status, 503);
  assert.equal((await (await read('/status')).json()).enabled, false);
  assert.deepEqual(await sql('SELECT seq,enabled FROM flags'), [
    { seq: 3, enabled: 0 },
  ]);
});
