import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  getMeetRealtimeScopesForRole,
  meetAccountDeviceId,
  meetRealtimeTokenPayloadSchema,
  type MeetRealtimeTokenPayload,
} from '../../../packages/realtime/src/meet';
import { MEET_CLASSROOM_TOOLS_SCOPE } from '../../../packages/realtime/src/meet/classroom-tools-schema';
import { meetRoomAccountAlias } from '../../../packages/realtime/src/meet/room-account-alias';
import type { BreakoutsView } from '../../../packages/realtime/src/meet/room-breakouts';
import type { QuizArenaFullView } from '../../../packages/realtime/src/meet/room-quiz-arena';
import { board } from '../../../packages/realtime/src/meet/room-quiz-arena.fixtures';
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

const SECRET = 'room-do-guest-identity-secret';
const WS = '30000000-0000-4000-8000-000000000001';
const MEETING = '20000000-0000-4000-8000-000000000001';
const ROOM = `${WS}:${MEETING}`;
const account = {
  host: '10000000-0000-4000-8000-000000000011',
  member: '10000000-0000-4000-8000-000000000012',
  guest: '10000000-0000-4000-8000-000000000013',
};
type Name = keyof typeof account;
const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

/**
 * The token a member's device-less client receives: the issuers sign the
 * account id separately and a keyed room id as the connection id. A guest's
 * ids are per-meeting pseudonyms.
 */
async function issued(
  name: Name,
  extra: Partial<MeetRealtimeTokenPayload> = {}
) {
  const role = name === 'host' ? 'host' : 'speaker';
  return meetRealtimeTokenPayloadSchema.parse({
    accountId: account[name],
    userId:
      name === 'guest'
        ? crypto.randomUUID()
        : await meetAccountDeviceId(SECRET, ROOM, account[name]),
    role,
    displayName: name,
    admission: name === 'guest' ? 'lobby' : 'open',
    ...(name === 'guest' ? { guest: true } : {}),
    mode: 'call',
    meetingApp: 'meet',
    exp: Math.floor(Date.now() / 1000) + 600,
    meetingId: MEETING,
    wsId: WS,
    roomId: ROOM,
    scopes: getMeetRealtimeScopesForRole(role),
    ...extra,
  });
}

function fixture() {
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
      delete: async (key: string) => values.delete(key),
      getAlarm: async () => null,
      setAlarm: async () => undefined,
    },
  } as unknown as DurableObjectState;
  const env = { MEET_REALTIME_TOKEN_SECRET: SECRET } as MeetRoomEnv;
  const room = new MeetRoomDurableObject(state, env);

  async function join(name: Name) {
    const token = await issued(name);
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
  async function service(name: Name, body: object, scopes: string[] = []) {
    const base = await issued(name);
    const token = {
      ...base,
      scopes: [...base.scopes, 'meet:server', ...scopes],
    };
    const response = await room.fetch(
      new Request('https://meet.test/room-service', {
        method: 'POST',
        headers: { 'x-meet-token': JSON.stringify(token) },
        body: JSON.stringify(body),
      })
    );
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  return { join, send, service };
}

async function callWithGuest() {
  const room = fixture();
  const host = await room.join('host');
  const member = await room.join('member');
  const guest = await room.join('guest');
  await room.send(host.socket, {
    type: 'admission.decide',
    userId: guest.token.userId,
    admit: true,
  });
  await settle();
  // A device-less member puts its connection id into presence, chat and stage.
  await room.send(member.socket, {
    type: 'presence.update',
    media: { audioEnabled: true, screenEnabled: false, videoEnabled: false },
  });
  await room.send(member.socket, { type: 'chat.message', body: 'hi' });
  await room.send(member.socket, { type: 'hand.raise', raised: true });
  await settle();
  return { ...room, host, member, guest };
}

const assertNoForeignIds = (wire: string) => {
  assert.ok(!wire.includes(account.host), wire);
  assert.ok(!wire.includes(account.member), wire);
};

test('a device-less member’s frames reach a guest without its account id', async () => {
  const { member, guest } = await callWithGuest();
  assert.notEqual(member.token.userId, account.member);
  assert.ok(guest.wires.length > 0);
  // The guest sees the member's connection id, never the account behind it.
  assert.ok(guest.wires.join('\n').includes(member.token.userId));
  for (const wire of guest.wires) assertNoForeignIds(wire);
});

test('a guest’s Quiz Arena view names other players only by their room alias', async () => {
  const { service } = await callWithGuest();
  await service('host', {
    action: 'arena.setup',
    board: board(),
    config: { answerMode: 'buzz_in', playMode: 'individual' },
  });
  const hostView = (await service('host', {
    action: 'arena.state',
  })) as QuizArenaFullView;
  const tileId = hostView.tiles[0]!.id;
  await service('host', { action: 'arena.pickTile', tileId });
  await service('member', { action: 'arena.buzz', tileId });
  await service('guest', { action: 'arena.buzz', tileId });

  const view = (await service('guest', {
    action: 'arena.state',
  })) as QuizArenaFullView;
  assertNoForeignIds(JSON.stringify(view));
  const memberAlias = meetRoomAccountAlias(SECRET, ROOM, account.member);
  assert.deepEqual(
    view.tiles[0]!.buzzQueue.map(({ userId }) => userId),
    [memberAlias, account.guest]
  );
  assert.ok(view.players.some(({ userId }) => userId === account.guest));
  assert.ok(view.players.some(({ userId }) => userId === memberAlias));

  // The host judges by real ids, and scoring stays keyed by account.
  await service('host', {
    action: 'arena.judge',
    tileId,
    userId: account.member,
    correct: false,
  });
  const after = (await service('host', {
    action: 'arena.state',
  })) as QuizArenaFullView;
  assert.ok(after.players.some(({ userId }) => userId === account.member));
});

test('a guest’s breakout group shows a member only by its room alias', async () => {
  const { service } = await callWithGuest();
  const tools = [MEET_CLASSROOM_TOOLS_SCOPE];
  const sessionId = crypto.randomUUID();
  await service(
    'host',
    {
      action: 'breakouts.create',
      sessionId,
      mode: 'student_pick',
      roomCount: 2,
      durationMinutes: 10,
    },
    tools
  );
  for (const name of ['member', 'guest'] as const)
    await service(
      'host',
      {
        action: 'breakouts.assign',
        sessionId,
        participantId: account[name],
        groupId: 1,
      },
      tools
    );
  const view = (await service(
    'guest',
    { action: 'breakouts.read' },
    tools
  )) as BreakoutsView;
  assertNoForeignIds(JSON.stringify(view));
  const memberAlias = meetRoomAccountAlias(SECRET, ROOM, account.member);
  assert.deepEqual(view.session?.groups[0]?.memberIds, [
    memberAlias,
    account.guest,
  ]);
  assert.ok(view.participants.some(({ id }) => id === memberAlias));
  // The guest still moves itself; the room keeps account ids.
  await service(
    'guest',
    { action: 'breakouts.join', sessionId, groupId: 2 },
    tools
  );
  const hostView = (await service(
    'host',
    { action: 'breakouts.read' },
    tools
  )) as BreakoutsView;
  assert.deepEqual(hostView.session?.groups[1]?.memberIds, [account.guest]);
});
