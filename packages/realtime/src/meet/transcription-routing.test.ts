import assert from 'node:assert/strict';
import { it as test, vi } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
} from './index';

const host = meetRealtimeTokenPayloadSchema.parse({
  userId: '33333333-3333-4333-8333-333333333333',
  exp: 2000000000,
  role: 'host',
  scopes: getMeetRealtimeScopesForRole('host'),
  mode: 'call',
  limits: {},
  meetingId: '11111111-1111-4111-8111-111111111111',
  roomId: 'room',
  wsId: '11111111-1111-4111-8111-111111111111',
});
const guest = {
  ...host,
  userId: '22222222-2222-4222-8222-222222222222',
  role: 'speaker' as const,
};
const lobby = {
  ...guest,
  userId: '55555555-5555-4555-8555-555555555555',
  admission: 'lobby' as const,
};
async function fixture(stored?: Map<string, unknown>) {
  // Load the app at runtime so package type-checking stays inside its source root.
  const { MeetRoomDurableObject } = await vi.importActual<{
    MeetRoomDurableObject: new (
      state: unknown,
      env: object
    ) => {
      webSocketMessage(
        socket: unknown,
        raw: string | ArrayBuffer
      ): Promise<void>;
    };
  }>('../../../../apps/meet-realtime/src/room-do');

  vi.stubGlobal('WebSocketRequestResponsePair', class {});

  let snapshot = createMeetRoomSnapshot();
  for (const token of [host, guest, lobby])
    snapshot = admitOrHold(snapshot, token, new Date().toISOString()).state;
  const values = stored ?? new Map<string, unknown>([['snapshot', snapshot]]);
  const sockets = [host, guest, lobby].map((token) => ({
    readyState: 1,
    close() {},
    deserializeAttachment: () => ({ token }),
    sent: [] as string[],
    send(value: string) {
      this.sent.push(value);
    },
  }));
  const state = {
    storage: {
      get: async (key: string) => values.get(key),
      put: async (key: string, value: unknown) => {
        values.set(key, structuredClone(value));
      },
      getAlarm: async () => null,
      setAlarm: async () => {},
    },
    setWebSocketAutoResponse: () => {},
    getWebSockets: () => sockets,
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
  };
  return {
    room: new MeetRoomDurableObject(state, {}),
    sockets,
    values,
  };
}
test('DO broadcasts state only to admitted sockets and delivers consent only to self and host', async () => {
  const { room, sockets } = await fixture();
  const [h, g, l] = sockets;
  if (!h || !g || !l) throw new Error('missing fixture socket');
  const start = {
    type: 'transcription.state',
    state: {
      active: true,
      sessionId: '44444444-4444-4444-8444-444444444444',
      startedBy: host.userId,
      language: 'vi',
      consentRequired: true,
    },
  };
  await room.webSocketMessage(h, JSON.stringify(start));
  assert.ok(h.sent.includes(JSON.stringify(start)));
  assert.ok(g.sent.includes(JSON.stringify(start)));
  assert.equal(l.sent.length, 0);
  for (const s of sockets) s.sent.length = 0;
  const consent = {
    type: 'transcription.consent',
    userId: guest.userId,
    allowed: true,
  };
  await room.webSocketMessage(g, JSON.stringify(consent));
  assert.ok(h.sent.includes(JSON.stringify(consent)));
  assert.ok(g.sent.includes(JSON.stringify(consent)));
  assert.equal(l.sent.length, 0);
  for (const s of sockets) s.sent.length = 0;
  await room.webSocketMessage(
    l,
    JSON.stringify({ ...consent, userId: lobby.userId })
  );
  assert.ok(l.sent.some((m) => m.includes('awaiting_admission')));
  assert.equal(h.sent.length, 0);
  assert.equal(g.sent.length, 0);
  for (const s of sockets) s.sent.length = 0;
  await room.webSocketMessage(
    g,
    JSON.stringify({ ...consent, userId: host.userId })
  );
  assert.ok(g.sent.some((m) => m.includes('permission_denied')));
  assert.equal(h.sent.length, 0);
});

test('DO storage retains only current-session consent, restores it, and clears it on stop and room end', async () => {
  const first = await fixture();
  const h = first.sockets[0]!;
  const g = first.sockets[1]!;
  const sessionId = '44444444-4444-4444-8444-444444444444';
  const start = {
    type: 'transcription.state',
    state: {
      active: true,
      sessionId,
      startedBy: host.userId,
      language: 'vi',
      consentRequired: true,
    },
  };
  await first.room.webSocketMessage(h, JSON.stringify(start));
  await first.room.webSocketMessage(
    g,
    JSON.stringify({
      type: 'transcription.consent',
      userId: guest.userId,
      allowed: true,
    })
  );
  const saved = first.values.get('snapshot');
  assert.ok(JSON.stringify(saved).includes('"decisions"'));
  const second = await fixture(first.values);
  await second.room.webSocketMessage(
    second.sockets[1]!,
    JSON.stringify({
      type: 'transcription.consent',
      userId: guest.userId,
      allowed: false,
    })
  );
  assert.ok(
    JSON.stringify(first.values.get('snapshot')).includes(
      `"${guest.userId}":false`
    )
  );
  await second.room.webSocketMessage(
    second.sockets[0]!,
    JSON.stringify({ ...start, state: { ...start.state, active: false } })
  );
  assert.ok(
    !JSON.stringify(first.values.get('snapshot')).includes(
      '"transcriptionConsents":{'
    )
  );
  const next = {
    ...start,
    state: {
      ...start.state,
      sessionId: '66666666-6666-4666-8666-666666666666',
    },
  };
  await second.room.webSocketMessage(second.sockets[0]!, JSON.stringify(next));
  assert.ok(
    JSON.stringify(first.values.get('snapshot')).includes('"decisions":{}')
  );
  await second.room.webSocketMessage(
    second.sockets[1]!,
    JSON.stringify({
      type: 'transcription.consent',
      userId: guest.userId,
      allowed: true,
    })
  );
  await second.room.webSocketMessage(
    second.sockets[0]!,
    JSON.stringify({ type: 'room.end' })
  );
  assert.ok(
    !JSON.stringify(first.values.get('snapshot')).includes(
      '"transcriptionConsents":{'
    )
  );
});
test('DO rejects oversized UTF-8 strings and binary payloads before JSON parsing or persistence', async () => {
  const { room, sockets, values } = await fixture();
  const before = values.get('snapshot');
  const h = sockets[0]!;
  for (const raw of [
    `{${'é'.repeat(150_000)}`,
    new Uint8Array(300_000).buffer,
    JSON.stringify({
      type: 'transcription.consent',
      userId: host.userId,
      allowed: true,
      extra: 'x'.repeat(300_000),
    }),
  ]) {
    h.sent.length = 0;
    await room.webSocketMessage(h, raw);
    assert.deepEqual(h.sent, [
      JSON.stringify({ error: 'message_too_large', type: 'error' }),
    ]);
    assert.equal(values.get('snapshot'), before);
  }
});

test('DO restoration durably removes unscoped legacy consent before processing a message', async () => {
  const base = admitOrHold(
    createMeetRoomSnapshot(),
    host,
    new Date().toISOString()
  ).state;
  const values = new Map<string, unknown>([
    [
      'snapshot',
      {
        ...base,
        transcription: {
          active: true,
          sessionId: '44444444-4444-4444-8444-444444444444',
          startedBy: host.userId,
          language: 'vi',
          consentRequired: true,
        },
        transcriptionConsents: { [guest.userId]: true },
      },
    ],
  ]);
  const { room, sockets } = await fixture(values);
  await room.webSocketMessage(sockets[0]!, '{');
  assert.ok(
    !JSON.stringify(values.get('snapshot')).includes(
      '"transcriptionConsents":{'
    )
  );
});
