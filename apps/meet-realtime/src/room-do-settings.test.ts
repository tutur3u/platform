import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
  type MeetRealtimeServerMessage,
  type MeetRoomSnapshot,
} from '../../../packages/realtime/src/meet';
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

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function tokenFor(n: number, extra: Record<string, unknown> = {}) {
  const role = n === 1 ? 'host' : 'speaker';
  return meetRealtimeTokenPayloadSchema.parse({
    userId: id(n),
    accountId: id(n + 100),
    role,
    admission: role === 'host' ? 'open' : 'lobby',
    mode: 'call',
    meetingApp: 'meet',
    exp: Math.floor(Date.now() / 1000) + 600,
    meetingId: '11111111-1111-4111-8111-111111111111',
    wsId: '22222222-2222-4222-8222-222222222222',
    roomId: 'ws:meeting',
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
      getAlarm: async () => null,
      setAlarm: async () => undefined,
    },
  } as unknown as DurableObjectState;
  const room = new MeetRoomDurableObject(state, {} as MeetRoomEnv);
  async function join(token: ReturnType<typeof tokenFor>) {
    const messages: MeetRealtimeServerMessage[] = [];
    const socket = {
      readyState: WebSocket.OPEN as number,
      send: (raw: string) => messages.push(JSON.parse(raw)),
      close: () => undefined,
      deserializeAttachment: () => ({ token }),
      serializeAttachment: () => undefined,
    } as unknown as WebSocket;
    joining = socket;
    await room.fetch(
      new Request('https://meet.test/realtime', {
        headers: {
          'x-meet-token': JSON.stringify(token),
          Upgrade: 'websocket',
        },
      })
    );
    return { socket, messages };
  }
  const send = (socket: WebSocket, message: object) =>
    room.webSocketMessage(socket, JSON.stringify(message));
  const snapshot = () => values.get('snapshot') as MeetRoomSnapshot;
  return { join, send, snapshot };
}

const heldSettings = (messages: MeetRealtimeServerMessage[]) =>
  messages.filter((message) => message.type === 'room.settings');

test('a default activity the host sets is kept and echoed to the sender and the room', async () => {
  const { join, send, snapshot } = fixture();
  const host = await join(tokenFor(1));
  const other = await join(tokenFor(2, { admission: 'open' }));
  host.messages.length = other.messages.length = 0;
  for (const toolId of ['live-qa', 'pen-whiteboard', 'live-flashcards']) {
    await send(host.socket, {
      type: 'room.settings.update',
      requestId: `req-${toolId}`,
      settings: { defaultActivity: `tool:${toolId}` },
    });
    assert.equal(snapshot().settings?.defaultActivity, `tool:${toolId}`);
    assert.ok(
      heldSettings(host.messages).some(
        (message) =>
          message.type === 'room.settings' &&
          message.requestId === `req-${toolId}` &&
          message.settings.defaultActivity === `tool:${toolId}`
      )
    );
    assert.ok(
      heldSettings(other.messages).some(
        (message) =>
          message.type === 'room.settings' &&
          message.settings.defaultActivity === `tool:${toolId}`
      )
    );
  }
});

test('automatic admission admits the signed-in people who arrive and who already wait, never guests', async () => {
  const { join, send, snapshot } = fixture();
  const host = await join(tokenFor(1));
  const waiting = await join(tokenFor(2));
  const guest = await join(tokenFor(3, { guest: true }));
  assert.deepEqual(Object.keys(snapshot().waiting).sort(), [id(2), id(3)]);
  await send(host.socket, {
    type: 'room.settings.update',
    requestId: 'skip',
    settings: { skipLobby: true },
  });
  assert.equal(snapshot().settings?.skipLobby, true);
  assert.ok(snapshot().presence[id(2)]);
  assert.deepEqual(Object.keys(snapshot().waiting), [id(3)]);
  assert.ok(
    waiting.messages.some(
      (message) => message.type === 'admission.result' && message.admitted
    )
  );
  assert.ok(
    !guest.messages.some((message) => message.type === 'admission.result')
  );
  await join(tokenFor(4));
  assert.ok(snapshot().presence[id(4)]);
  assert.ok(!snapshot().waiting[id(4)]);
});

test('a refused settings write names its request', async () => {
  const { join, send, snapshot } = fixture();
  await join(tokenFor(1));
  const member = await join(tokenFor(2, { admission: 'open' }));
  member.messages.length = 0;
  await send(member.socket, {
    type: 'room.settings.update',
    requestId: 'denied',
    settings: { skipLobby: true },
  });
  assert.equal(snapshot().settings?.skipLobby, undefined);
  assert.deepEqual(
    member.messages.filter((message) => message.type === 'error'),
    [{ type: 'error', error: 'permission_denied', requestId: 'denied' }]
  );
});
