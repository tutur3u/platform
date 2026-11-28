import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
  type MeetRealtimeServerMessage,
  type MeetRoomSnapshot,
} from '../../../packages/realtime/src/meet';
import { meetRoomAccountAlias } from '../../../packages/realtime/src/meet/room-account-alias';
import { MeetRoomDurableObject, type MeetRoomEnv } from './room-do';

globalThis.WebSocketRequestResponsePair =
  class {} as typeof WebSocketRequestResponsePair;
const NativeResponse = Response;
Object.assign(globalThis, {
  Response: class extends NativeResponse {
    constructor(body?: BodyInit | null, init?: ResponseInit) {
      super(body, init?.status === 101 ? { ...init, status: 200 } : init);
    }
  },
});

const SECRET = 'room-do-guest-secret';
const ROOM = '30000000-0000-4000-8000-000000000001:meeting';
const account = {
  host: '10000000-0000-4000-8000-000000000001',
  member: '10000000-0000-4000-8000-000000000002',
  guest: '10000000-0000-4000-8000-000000000003',
};
// Presence deltas leave the room after the publisher's 50 ms coalescing window.
const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

function fixture(env: Partial<MeetRoomEnv>) {
  const values = new Map<string, unknown>();
  const sockets: WebSocket[] = [];
  let joining: WebSocket | undefined;
  Object.assign(globalThis, {
    WebSocketPair: class {
      0 = {};
      1 = joining;
    },
  });
  const state = {
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
    setWebSocketAutoResponse: () => undefined,
    getWebSockets: () => sockets,
    acceptWebSocket: (socket: WebSocket) => {
      sockets.push(socket);
    },
    waitUntil: () => undefined,
    storage: {
      get: async (key: string) => values.get(key),
      put: async (key: string, value: unknown) => {
        values.set(key, structuredClone(value));
      },
      getAlarm: async () => null,
      setAlarm: async () => undefined,
    },
  } as unknown as DurableObjectState;
  const room = new MeetRoomDurableObject(state, env as MeetRoomEnv);

  async function join(name: keyof typeof account) {
    const role = name === 'host' ? 'host' : 'speaker';
    const token = meetRealtimeTokenPayloadSchema.parse({
      accountId: account[name],
      // Device identities are distinct from account ids, as the web client sends.
      userId: crypto.randomUUID(),
      role,
      admission: name === 'guest' ? 'lobby' : 'open',
      ...(name === 'guest' ? { guest: true } : {}),
      mode: 'call',
      meetingApp: 'meet',
      exp: Math.floor(Date.now() / 1000) + 600,
      meetingId: '20000000-0000-4000-8000-000000000001',
      wsId: '30000000-0000-4000-8000-000000000001',
      roomId: ROOM,
      scopes: getMeetRealtimeScopesForRole(role),
    });
    let attached: unknown = null;
    const wires: string[] = [];
    const socket = {
      readyState: WebSocket.OPEN as number,
      send: (raw: string) => {
        wires.push(raw);
      },
      close: () => undefined,
      deserializeAttachment: () => attached,
      serializeAttachment: (next: unknown) => {
        attached = next;
      },
    } as unknown as WebSocket;
    joining = socket;
    await room.fetch(
      new Request('https://meet.test/realtime?presenceDelta=1', {
        headers: {
          'x-meet-token': JSON.stringify(token),
          Upgrade: 'websocket',
        },
      })
    );
    return { token, wires, socket };
  }
  const send = (socket: WebSocket, message: object) =>
    room.webSocketMessage(socket, JSON.stringify(message));
  const snapshot = () => values.get('snapshot') as MeetRoomSnapshot;
  return { join, send, snapshot };
}

async function callWithGuest(env: Partial<MeetRoomEnv>) {
  const { join, send, snapshot } = fixture(env);
  const host = await join('host');
  const member = await join('member');
  const guest = await join('guest');
  await send(host.socket, {
    type: 'admission.decide',
    userId: guest.token.userId,
    admit: true,
  });
  await settle();
  await send(member.socket, {
    type: 'presence.update',
    media: { audioEnabled: true, screenEnabled: false, videoEnabled: false },
  });
  await send(host.socket, { type: 'chat.message', body: 'welcome' });
  await settle();
  return { host, member, guest, send, snapshot };
}

const assertNoForeignIds = (wires: string[]) => {
  assert.ok(wires.length > 0);
  for (const wire of wires) {
    assert.ok(!wire.includes(account.host), wire);
    assert.ok(!wire.includes(account.member), wire);
  }
};

test('a guest admitted to a call never receives the host’s or a member’s account id', async () => {
  const { host, member, guest, send, snapshot } = await callWithGuest({
    MEET_REALTIME_TOKEN_SECRET: SECRET,
  });
  // Server state keeps the real ids for admission, consent and moderation.
  assert.equal(snapshot().presence[host.token.userId]?.accountId, account.host);
  const frames = guest.wires.map(
    (wire) => JSON.parse(wire) as MeetRealtimeServerMessage
  );
  const types = new Set(frames.map((frame) => frame.type));
  for (const type of ['presence', 'presence.delta', 'chat.message'])
    assert.ok(types.has(type as MeetRealtimeServerMessage['type']), type);
  assertNoForeignIds(guest.wires);

  const hostAlias = meetRoomAccountAlias(SECRET, ROOM, account.host);
  const delta = frames.find(
    (frame) =>
      frame.type === 'presence.delta' &&
      frame.upserted.some((person) => person.userId === host.token.userId)
  );
  assert.ok(delta?.type === 'presence.delta');
  assert.equal(
    delta.upserted.find((person) => person.userId === host.token.userId)
      ?.accountId,
    hostAlias
  );
  // A full snapshot requested by the guest carries the same alias.
  const before = guest.wires.length;
  await send(guest.socket, { type: 'presence.resync' });
  const resync = guest.wires
    .slice(before)
    .map((wire) => JSON.parse(wire) as MeetRealtimeServerMessage)
    .find((frame) => frame.type === 'presence');
  assert.ok(resync?.type === 'presence');
  const byUser = (userId: string) =>
    resync.presence.find((person) => person.userId === userId)?.accountId;
  assert.equal(byUser(host.token.userId), hostAlias);
  assert.equal(byUser(guest.token.userId), account.guest);
  assert.ok(byUser(member.token.userId));
  assertNoForeignIds(guest.wires);
  assert.ok(
    frames.some(
      (frame) => frame.type === 'chat.message' && frame.accountId === hostAlias
    )
  );
  // Workspace members keep the real ids their features read.
  assert.ok(member.wires.join('\n').includes(account.host));
  assert.ok(host.wires.join('\n').includes(account.guest));
});

test('a guest receives no other account id when the room has no secret', async () => {
  const { guest } = await callWithGuest({});
  assertNoForeignIds(guest.wires);
  assert.ok(guest.wires.some((wire) => wire.includes(account.guest)));
});
