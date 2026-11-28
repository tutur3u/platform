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
import { type MeetWebSocket, send as sendLocal } from './room-state';

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
  external: '10000000-0000-4000-8000-000000000004',
};
type Name = keyof typeof account;
type Outside = 'guest' | 'external';
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
  let room = new MeetRoomDurableObject(state, env as MeetRoomEnv);
  // A fresh object over the same storage and sockets, as after hibernation.
  const restart = () => {
    room = new MeetRoomDurableObject(state, env as MeetRoomEnv);
  };

  async function join(
    name: Name,
    previous?: { token: ReturnType<typeof tokenFor> }
  ) {
    const token = previous?.token ?? tokenFor(name);
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
  const store = (next: MeetRoomSnapshot) => values.set('snapshot', next);
  return { join, send, snapshot, store, restart };
}

function tokenFor(name: Name) {
  const role = name === 'host' ? 'host' : 'speaker';
  return meetRealtimeTokenPayloadSchema.parse({
    accountId: account[name],
    // Device identities are distinct from account ids, as the web client sends.
    userId: crypto.randomUUID(),
    role,
    // Members join with open admission; everyone else through the lobby.
    admission: name === 'host' || name === 'member' ? 'open' : 'lobby',
    ...(name === 'guest' ? { guest: true } : {}),
    mode: 'call',
    meetingApp: 'meet',
    exp: Math.floor(Date.now() / 1000) + 600,
    meetingId: '20000000-0000-4000-8000-000000000001',
    wsId: '30000000-0000-4000-8000-000000000001',
    roomId: ROOM,
    scopes: getMeetRealtimeScopesForRole(role),
  });
}

async function callWithGuest(
  env: Partial<MeetRoomEnv>,
  outside: Outside = 'guest',
  options: { chatBeforeAdmission?: boolean } = {}
) {
  const room = fixture(env);
  const { join, send } = room;
  const host = await join('host');
  const member = await join('member');
  if (options.chatBeforeAdmission)
    await send(host.socket, { type: 'chat.message', body: 'before you' });
  const guest = await join(outside);
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
  return { ...room, host, member, guest };
}

const framesOf = (wires: string[]) =>
  wires.map((wire) => JSON.parse(wire) as MeetRealtimeServerMessage);

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

test('chat replayed on admission reaches a guest with the author alias', async () => {
  const { guest } = await callWithGuest(
    { MEET_REALTIME_TOKEN_SECRET: SECRET },
    'guest',
    { chatBeforeAdmission: true }
  );
  const replayed = framesOf(guest.wires).filter(
    (frame) => frame.type === 'chat.message' && frame.replayed
  );
  assert.ok(replayed.length > 0);
  for (const frame of replayed)
    assert.equal(
      frame.type === 'chat.message' ? frame.accountId : undefined,
      meetRoomAccountAlias(SECRET, ROOM, account.host)
    );
  assertNoForeignIds(guest.wires);
});

test('a signed-in account outside the workspace sees aliases, not account ids', async () => {
  const { host, member, guest } = await callWithGuest(
    { MEET_REALTIME_TOKEN_SECRET: SECRET },
    'external',
    { chatBeforeAdmission: true }
  );
  assert.equal(guest.token.guest, undefined);
  assertNoForeignIds(guest.wires);
  assert.ok(guest.wires.some((wire) => wire.includes(account.external)));
  assert.ok(
    guest.wires.some((wire) =>
      wire.includes(meetRoomAccountAlias(SECRET, ROOM, account.host))
    )
  );
  assert.ok(member.wires.join('\n').includes(account.external));
  assert.ok(host.wires.join('\n').includes(account.member));
});

test('the resync after hibernation and the Mira Live announcement keep the alias', async () => {
  const env = { MEET_REALTIME_TOKEN_SECRET: SECRET };
  const room = await callWithGuest(env);
  const { guest, member } = room;
  // A Mira Live session the host owns, as the stored room holds it.
  room.store({
    ...room.snapshot(),
    liveAssistant: {
      sessionId: crypto.randomUUID(),
      ownerId: account.host,
      expiresAt: Date.now() + 60_000,
      sequence: 0,
    },
  });
  // The guest's socket last saw an older sequence, so the restore resyncs it.
  const attachment = guest.socket.deserializeAttachment() as object;
  guest.socket.serializeAttachment({ ...attachment, presenceSeq: -1 });
  room.restart();
  const before = guest.wires.length;
  await room.send(member.socket, { type: 'presence.resync' });
  const restored = framesOf(guest.wires.slice(before));
  const full = restored.find((frame) => frame.type === 'presence');
  assert.ok(full?.type === 'presence');
  assert.ok(full.presence.length >= 3);
  assertNoForeignIds(guest.wires.slice(before));

  // A reconnecting guest receives the live announcement with the owner alias.
  const again = await room.join('guest', guest);
  const live = framesOf(again.wires).find(
    (frame) => frame.type === 'assistant.live'
  );
  assert.ok(live?.type === 'assistant.live');
  assert.equal(live.ownerId, meetRoomAccountAlias(SECRET, ROOM, account.host));
  assertNoForeignIds(again.wires);
  const memberAgain = await room.join('member', member);
  assert.ok(
    framesOf(memberAgain.wires).some(
      (frame) =>
        frame.type === 'assistant.live' && frame.ownerId === account.host
    )
  );
});

test('the local Bun server projects frames for a guest the same way', () => {
  const previous = process.env.MEET_REALTIME_TOKEN_SECRET;
  process.env.MEET_REALTIME_TOKEN_SECRET = SECRET;
  try {
    const wires: string[] = [];
    const socket = {
      data: { token: tokenFor('guest') },
      readyState: 1,
      send: (wire: string) => void wires.push(wire),
    } as unknown as MeetWebSocket;
    const host = tokenFor('host');
    sendLocal(socket, {
      type: 'chat.message',
      id: crypto.randomUUID(),
      body: 'hi',
      createdAt: new Date().toISOString(),
      displayName: 'Host',
      accountId: account.host,
      userId: host.userId,
    });
    sendLocal(socket, {
      type: 'assistant.live',
      sessionId: crypto.randomUUID(),
      ownerId: account.member,
      active: true,
    });
    assert.equal(wires.length, 2);
    assertNoForeignIds(wires);
    assert.ok(
      wires[0]!.includes(meetRoomAccountAlias(SECRET, ROOM, account.host))
    );
  } finally {
    if (previous === undefined) delete process.env.MEET_REALTIME_TOKEN_SECRET;
    else process.env.MEET_REALTIME_TOKEN_SECRET = previous;
  }
});
