import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { startCfViteWorker } from '../../../scripts/ci/cf-vite-worker.mjs';
import { ORG_CANARIES } from '../src/org-canaries.ts';
import {
  ASSERTION_HEADER,
  base64,
  PUBLISHER_USER_HEADER,
  publisherMessage,
  SIGNATURE_HEADER,
  signAssertion,
} from '../src/protocol.ts';

const user = '11111111-1111-4111-8111-111111111111';
const gateway = 'runtime-fixture-only-gateway-value-at-least-43-chars';
let server;
let keys;
let seq = 0;
const node = {
  key: 'a'.repeat(32),
  kind: 'agent',
  label: 'Release agent',
  role: 'Release',
  roleKey: 'release-agent',
  area: 'release',
  status: 'working',
  activity: 'now',
};
const snapshot = (patch = {}) => ({
  needsYou: [],
  environments: [],
  lanes: [],
  backlog: [],
  org: { nodes: [{ ...node, ...patch }], edges: [] },
});
async function ingest(body) {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return server.fetch('/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [PUBLISHER_USER_HEADER]: user,
      [SIGNATURE_HEADER]: base64(
        await crypto.subtle.sign(
          'Ed25519',
          keys.privateKey,
          publisherMessage(user, bytes)
        )
      ),
    },
    body: bytes,
  });
}
async function publish(value, v = 3) {
  const response = await ingest({
    v,
    seq: seq + 1,
    sentAt: Date.now(),
    events: [],
    snapshot: value,
  });
  if (response.status === 200) seq++;
  return response;
}
async function read(target) {
  return server.fetch(target, {
    headers: {
      [ASSERTION_HEADER]: await signAssertion(gateway, user, 'GET', target),
    },
  });
}
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
      OPS_HUB_ALLOWED_USER_IDS: user,
    },
  });
});
after(async () => {
  await server?.close();
});
test('v3 stores agent role keys and areas but lanes strictly omit roleKey', async () => {
  const { roleKey, ...lane } = node;
  assert.equal(roleKey, 'release-agent');
  const value = {
    ...snapshot(),
    org: {
      nodes: [
        node,
        { ...lane, key: 'b'.repeat(32), kind: 'lane', area: 'mobile' },
      ],
      edges: [],
    },
  };
  assert.equal((await publish(value)).status, 200);
  assert.deepEqual((await (await read('/snapshot')).json()).org, value.org);
  for (const invalid of [
    snapshot({ kind: 'lane' }),
    snapshot({ roleKey: 'thread-canary' }),
    snapshot({ area: 'unknown' }),
    {
      ...value,
      org: {
        ...value.org,
        nodes: [
          node,
          { ...lane, key: 'b'.repeat(32), kind: 'lane', area: 'unknown' },
        ],
      },
    },
  ])
    assert.equal((await publish(invalid)).status, 400);
});
test('v3 signed ingest refuses label canaries and stores only null task titles', async () => {
  for (const { value } of ORG_CANARIES) {
    assert.equal((await publish(snapshot({ label: value }))).status, 400);
    assert.equal((await publish(snapshot({ roleKey: value }))).status, 400);
    assert.equal((await publish(snapshot({ taskTitle: value }))).status, 200);
    const stored = await server.durableObjectSql(
      'OpsHub',
      `hub:${user}`,
      'SELECT data FROM snapshot'
    );
    assert.equal(JSON.parse(stored[0].data).org.nodes[0].taskTitle, null);
    assert.ok(!stored[0].data.includes(value));
  }
});
test('org survives restart, appears only on authenticated reads, and v2 replacement removes it', async () => {
  assert.equal((await publish(snapshot())).status, 200);
  await server.restart();
  for (const target of ['/status', '/snapshot']) {
    assert.equal((await server.fetch(target)).status, 404);
    const value = await (await read(target)).json();
    if (target === '/snapshot') assert.deepEqual(value.org, snapshot().org);
    else
      assert.deepEqual(Object.keys(value).sort(), [
        'enabled',
        'erased',
        'lastPublisherAt',
        'publisherStale',
        'seq',
        'v',
      ]);
  }
  const exported = await (await read('/hub/export?section=snapshot')).json();
  assert.equal(exported.rows.length, 1);
  assert.deepEqual(exported.rows[0].data, {
    needsYou: [],
    environments: [],
    lanes: [],
    backlog: [],
  });
  assert.equal((await server.fetch('/org')).status, 404);
  assert.equal((await publish(undefined)).status, 200);
  assert.deepEqual(
    (await (await read('/snapshot')).json()).org,
    snapshot().org
  );
  const { org, ...v2 } = snapshot();
  assert.ok(org);
  assert.equal((await publish(v2, 2)).status, 200);
  assert.equal((await (await read('/snapshot')).json()).org, undefined);
  assert.equal(
    Object.hasOwn(await (await read('/status')).json(), 'org'),
    false
  );
});
test('expired snapshots and paused reads withhold org while status stays minimal', async () => {
  assert.equal((await publish(snapshot())).status, 200);
  await server.durableObjectSql(
    'OpsHub',
    `hub:${user}`,
    'UPDATE flags SET lastPublisherAt=?',
    [Date.now() - 31 * 86400000]
  );
  assert.equal(
    Object.hasOwn(await (await read('/status')).json(), 'org'),
    false
  );
  assert.equal(await (await read('/snapshot')).json(), null);
  assert.equal((await publish({ ...snapshot(), enabled: false })).status, 200);
  await server.restart();
  assert.equal(
    Object.hasOwn(await (await read('/status')).json(), 'org'),
    false
  );
  assert.equal((await read('/snapshot')).status, 503);
});
