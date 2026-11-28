import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'bun:test';
import type { ChannelTicket } from '../../../packages/realtime/src/channels/schema';
import type { CollaborationTicket } from '../../../packages/realtime/src/collaboration/server';
import {
  createProgrammingDocument,
  Y,
} from '../../../packages/realtime/src/collaboration';
import {
  collaborationOwnerBinding,
  meetRoomAccountAlias,
  sealChannelOwner,
} from '../../../packages/realtime/src/core/opaque-ids';
import { ChannelRoomDurableObject } from './channel-room-do';
import { CollaborationRoomDurableObject } from './collaboration-room-do';

/**
 * Meet documents and programming rooms reach signed-in people outside the
 * workspace. Their sockets must never receive another person's account id,
 * while the rooms keep authorizing tickets and checkpointing as the owner.
 */
const SECRET = 'outsider-account-ids-fixture-secret';
const WORKSPACE = '30000000-0000-4000-8000-000000000001';
const MEETING = '20000000-0000-4000-8000-000000000001';
const DOCUMENT = '40000000-0000-4000-8000-000000000001';
const PROJECT = '40000000-0000-4000-8000-000000000002';
const TOPIC = `meeting-document-${MEETING}`;
const ROOM = `playground:${PROJECT}`;
const id = {
  host: '10000000-0000-4000-8000-000000000001',
  member: '10000000-0000-4000-8000-000000000002',
  outsider: '10000000-0000-4000-8000-000000000003',
};
type Person = keyof typeof id;
const others = (person: Person) =>
  (Object.keys(id) as Person[]).filter((name) => name !== person);

type FakeSocket = {
  frames: string[];
  closed?: number;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): any;
  send(message: string): void;
  close(code?: number): void;
};
function fakeSocket(): FakeSocket {
  let attachment: unknown = null;
  const socket: FakeSocket = {
    frames: [],
    serializeAttachment: (value) => {
      attachment = structuredClone(value);
    },
    deserializeAttachment: () => structuredClone(attachment),
    send: (message) => socket.frames.push(message),
    close: (code) => {
      socket.closed = code ?? 1000;
    },
  };
  return socket;
}

const nativePair = (globalThis as any).WebSocketPair;
const NativeResponse = globalThis.Response;
let pairs: FakeSocket[][] = [];
beforeEach(() => {
  pairs = [];
  (globalThis as any).WebSocketPair = class {
    0 = fakeSocket();
    1 = fakeSocket();
    constructor() {
      pairs.push([this[0], this[1]]);
    }
  };
  globalThis.Response = class extends NativeResponse {
    constructor(body?: BodyInit | null, init: ResponseInit = {}) {
      super(body, { ...init, status: init.status === 101 ? 200 : init.status });
    }
  } as typeof Response;
});
afterEach(() => {
  (globalThis as any).WebSocketPair = nativePair;
  globalThis.Response = NativeResponse;
});

function roomState(values: Map<string, unknown>) {
  const sockets: FakeSocket[] = [];
  return {
    sockets,
    state: {
      storage: {
        get: async (key: string) => structuredClone(values.get(key)),
        put: async (key: string | Record<string, unknown>, value?: unknown) => {
          if (typeof key === 'string') values.set(key, structuredClone(value));
          else
            for (const [name, entry] of Object.entries(key))
              values.set(name, structuredClone(entry));
        },
        getAlarm: async () => null,
        setAlarm: async () => undefined,
      },
      getWebSockets: () => sockets,
      acceptWebSocket: (socket: FakeSocket) => sockets.push(socket),
      waitUntil: () => undefined,
      blockConcurrencyWhile: (run: () => Promise<void>) => run(),
    } as unknown as DurableObjectState,
  };
}

/** The document channel ticket Meet issues to every participant. */
function channelTicket(
  person: Person,
  overrides: Partial<ChannelTicket> = {}
): ChannelTicket {
  return {
    aud: 'tuturuuu.channels',
    kind: 'join',
    topic: TOPIC,
    userId: meetRoomAccountAlias(SECRET, `${WORKSPACE}:${MEETING}`, id[person]),
    ownerSeal: sealChannelOwner(SECRET, TOPIC, id.host),
    documentId: DOCUMENT,
    version: 0,
    role: 'editor',
    exp: Math.floor(Date.now() / 1000) + 60,
    ...overrides,
  };
}

function channelFixture() {
  const values = new Map<string, unknown>();
  const { state, sockets } = roomState(values);
  const room = new ChannelRoomDurableObject(state, {
    CHANNEL_ROOM: {} as DurableObjectNamespace,
    MEET_REALTIME_TOKEN_SECRET: SECRET,
  });
  const join = async (ticket: ChannelTicket) => {
    const response = await room.fetch(
      new Request('https://channels.invalid/channels', {
        headers: {
          Upgrade: 'websocket',
          'x-channel-ticket': JSON.stringify(ticket),
        },
      })
    );
    return { response, socket: pairs.at(-1)?.[1] };
  };
  return { room, values, sockets, join };
}

test('a document channel shows an outsider no account ids and still binds the owner', async () => {
  const channel = channelFixture();
  const joined: Partial<Record<Person, FakeSocket>> = {};
  for (const person of Object.keys(id) as Person[]) {
    const { response, socket } = await channel.join(channelTicket(person));
    assert.equal(response.status, 200);
    joined[person] = socket!;
    // A client may put anything in its presence; the room overrides the id.
    channel.room.webSocketMessage(
      socket as unknown as WebSocket,
      JSON.stringify({
        type: 'track',
        payload: {
          user: { id: id[person], name: person },
          user_id: id[person],
        },
      })
    );
  }
  // Server state keeps the real owner for authorization and checkpoints.
  assert.equal(
    (channel.values.get('metadata') as { ownerId: string }).ownerId,
    id.host
  );
  const wire = joined.outsider!.frames.join('\n');
  assert.ok(wire.includes('"presence"'));
  for (const person of others('outsider'))
    assert.ok(!wire.includes(id[person]), `outsider received ${person} id`);
  const last = JSON.parse(joined.outsider!.frames.at(-1)!);
  assert.equal(last.type, 'presence');
  assert.equal(Object.keys(last.state).length, 3);
  for (const key of Object.keys(last.state))
    assert.ok(!Object.values(id).includes(key));
});

test('a document channel refuses a seal for another owner or topic', async () => {
  const channel = channelFixture();
  assert.equal(
    (await channel.join(channelTicket('host'))).response.status,
    200
  );
  const wrongOwner = await channel.join(
    channelTicket('member', {
      ownerSeal: sealChannelOwner(SECRET, TOPIC, id.member),
    })
  );
  assert.equal(wrongOwner.response.status, 403);
  const otherTopic = await channel.join(
    channelTicket('member', {
      ownerSeal: sealChannelOwner(SECRET, `${TOPIC}-x`, id.host),
    })
  );
  assert.equal(otherTopic.response.status, 403);
  // A service ticket that names the owner directly still matches the room.
  const service = await channel.join(
    channelTicket('member', { ownerSeal: undefined, ownerId: id.host })
  );
  assert.equal(service.response.status, 200);
});

function collaborationFixture() {
  const doc = createProgrammingDocument(
    [{ path: 'main.py', content: 'print(1)' }],
    'python main.py'
  );
  const values = new Map<string, unknown>([
    [
      'metadata',
      {
        ownerId: id.host,
        resourceId: PROJECT,
        resource: 'playground',
        roomId: ROOM,
        revision: 1,
        checkpointHash: null,
        fileHashes: {},
      },
    ],
    ['programming-document', Y.encodeStateAsUpdate(doc)],
  ]);
  doc.destroy();
  const { state } = roomState(values);
  const room = new CollaborationRoomDurableObject(state, {
    COLLABORATION_ROOM: {} as DurableObjectNamespace,
    MEET_REALTIME_TOKEN_SECRET: SECRET,
  });
  const ticket = (
    person: Person,
    overrides: Partial<CollaborationTicket> = {}
  ): CollaborationTicket => ({
    aud: 'tuturuuu.collaboration',
    kind: 'join',
    roomId: ROOM,
    resourceId: PROJECT,
    resource: 'playground',
    // The browser ticket Meet issues: the holder's own id, the owner bound.
    ownerId: collaborationOwnerBinding(SECRET, ROOM, id.host),
    userId: id[person],
    role: person === 'host' ? 'owner' : 'editor',
    displayName: person,
    exp: Math.floor(Date.now() / 1000) + 60,
    ...overrides,
  });
  const send = async (value: CollaborationTicket, method = 'GET') => {
    const response = await room.fetch(
      new Request(
        `https://collaboration.invalid/collaboration${value.kind === 'join' ? '' : `/${value.kind}`}`,
        {
          method,
          headers: {
            Upgrade: 'websocket',
            'x-collaboration-ticket': JSON.stringify(value),
          },
          ...(method === 'POST' ? { body: '{}' } : {}),
        }
      )
    );
    return { response, socket: pairs.at(-1)?.[1] };
  };
  return { ticket, send };
}

test('a programming room shows an outsider no account ids in presence', async () => {
  const collaboration = collaborationFixture();
  const joined: Partial<Record<Person, FakeSocket>> = {};
  for (const person of Object.keys(id) as Person[]) {
    const { response, socket } = await collaboration.send(
      collaboration.ticket(person)
    );
    assert.equal(response.status, 200);
    joined[person] = socket!;
  }
  const wire = joined.outsider!.frames.join('\n');
  for (const person of others('outsider'))
    assert.ok(!wire.includes(id[person]), `outsider received ${person} id`);
  const presence = joined
    .outsider!.frames.map((frame) => JSON.parse(frame))
    .filter((frame) => frame.type === 'presence')
    .at(-1);
  assert.equal(presence.participants.length, 3);
  for (const participant of presence.participants)
    assert.ok(!Object.values(id).includes(participant.userId));
});

test('a programming room accepts an owner binding only on a browser join', async () => {
  const collaboration = collaborationFixture();
  const binding = collaboration.ticket('host');
  const checkpoint = await collaboration.send(
    { ...binding, kind: 'checkpoint' },
    'POST'
  );
  assert.equal(checkpoint.response.status, 403);
  const wrongRoom = await collaboration.send(
    collaboration.ticket('member', {
      ownerId: collaborationOwnerBinding(SECRET, 'playground:other', id.host),
    })
  );
  assert.equal(wrongRoom.response.status, 403);
  const forged = await collaboration.send(
    collaboration.ticket('member', { ownerId: id.member })
  );
  assert.equal(forged.response.status, 403);
});
