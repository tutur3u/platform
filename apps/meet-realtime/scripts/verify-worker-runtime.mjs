import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createTestHarness } from 'wrangler';

const configPath =
  process.env.MEET_REALTIME_TEST_CONFIG ??
  fileURLToPath(new URL('../wrangler.jsonc', import.meta.url));
if (process.env.MEET_REALTIME_TEST_CONFIG) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(config.name, 'tuturuuu-meet-realtime');
  assert.equal(config.compatibility_date, '2026-06-20');
  assert.ok(config.compatibility_flags.includes('nodejs_compat'));
  assert.deepEqual(config.durable_objects.bindings, [
    { name: 'CHANNEL_ROOM', class_name: 'ChannelRoomDurableObject' },
    {
      name: 'COLLABORATION_ROOM',
      class_name: 'CollaborationRoomDurableObject',
    },
    { name: 'MEET_ROOM', class_name: 'MeetRoomDurableObject' },
  ]);
  assert.deepEqual(config.migrations, [
    { tag: 'v1', new_sqlite_classes: ['MeetRoomDurableObject'] },
    {
      tag: 'v2-collaboration',
      new_sqlite_classes: ['CollaborationRoomDurableObject'],
    },
    { tag: 'v3-channels', new_sqlite_classes: ['ChannelRoomDurableObject'] },
  ]);
}
const secret = randomUUID() + randomUUID();
const server = createTestHarness({
  workers: [
    {
      configPath,
      secrets: {
        MEET_REALTIME_TOKEN_SECRET: secret,
        CLOUDFLARE_REALTIME_APP_ID: 'disposable-unused-fixture',
        CLOUDFLARE_REALTIME_APP_SECRET: 'disposable-unused-fixture',
        CLOUDFLARE_TURN_KEY_ID: 'disposable-unused-fixture',
        CLOUDFLARE_TURN_API_TOKEN: 'disposable-unused-fixture',
      },
    },
  ],
});
before(async () => {
  await server.listen();
});
after(async () => {
  await server.close();
});

test('serves complete health and rejects invalid credentials before room dispatch', async () => {
  const response = await server.fetch('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  for (const path of [
    '/room-state',
    '/channels/document',
    '/collaboration/checkpoint',
  ]) {
    const denied = await server.fetch(path);
    assert.equal(denied.status, 401, path);
    await denied.text();
  }
});

test('dispatches a signed isolated room read to the real SQLite Durable Object', async () => {
  const wsId = randomUUID();
  const meetingId = randomUUID();
  const encoded = Buffer.from(
    JSON.stringify({
      wsId,
      meetingId,
      roomId: `${wsId}:${meetingId}`,
      userId: randomUUID(),
      role: 'host',
      limits: {},
      scopes: [],
      mode: 'call',
      admission: 'open',
      exp: Math.floor(Date.now() / 1000) + 60,
    })
  ).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');
  const response = await server.fetch('/room-state', {
    headers: { Authorization: `Bearer ${encoded}.${signature}` },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const state = await response.json();
  assert.equal(state.ended, false);
  assert.equal(state.lifecycleVersion, 0);
  assert.deepEqual(state.settings, { shareNotes: false });
});
