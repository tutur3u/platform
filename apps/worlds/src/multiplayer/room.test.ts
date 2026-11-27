import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { World } from '@tuturuuu/worlds';
import {
  issueRoomAdmission,
  roomName,
  verifyRoomAdmission,
} from './admission.ts';
import { createWorldRoom, type RoomEvent, type RoomSocket } from './room.ts';
import { MAX_FRAMES_PER_SECOND, ROOM_CAPACITY } from './room-state.ts';

const secret = 'synthetic-fixture-secret-not-used-by-any-service';
const scope = { worldId: 'test-world', revision: 'test-r1', shard: 0 };
const start = 1_800_000_000_000;
const defaultWorld: World = {
  schemaVersion: 1,
  id: scope.worldId,
  spawns: [{ x: 0, z: 0, heading: 0 }],
  bounds: { width: 60, depth: 60 },
  objects: [],
  assets: [],
};

class FakeSocket implements RoomSocket {
  readyState = 1;
  events: RoomEvent[] = [];
  attachment: unknown;
  code?: number;
  serializeAttachment(value: unknown) {
    this.attachment = structuredClone(value);
  }
  deserializeAttachment() {
    return structuredClone(this.attachment);
  }
  send(value: string) {
    if (this.readyState !== 1) throw new Error('Socket is closed');
    this.events.push(JSON.parse(value));
  }
  close(code?: number) {
    this.readyState = 3;
    this.code = code;
  }
}

function fixture(world = defaultWorld) {
  let now = start;
  let stopped = false;
  let writes = 0;
  const clock = () => now;
  const sockets: FakeSocket[] = [];
  const env = {
    WORLDS_ROOM_ADMISSION_SECRET: secret,
    WORLDS_ROOMS: { idFromName: (name: string) => name },
  };
  const ctx = {
    id: roomName(scope),
    storage: {
      get: async () => stopped,
      put: async (_key: string, value: boolean) => {
        writes += 1;
        stopped = value;
      },
    },
    acceptWebSocket: (socket: RoomSocket) => sockets.push(socket as FakeSocket),
    getWebSockets: () => sockets.filter((socket) => socket.readyState === 1),
  };
  const Room = createWorldRoom(
    (target) => (target.revision === scope.revision ? world : null),
    {
      clock,
      upgrade: () => ({
        server: new FakeSocket(),
        response: new Response(null, { status: 200 }),
      }),
    }
  );
  const wake = () => new Room(ctx, env);
  const mint = (
    id: string,
    target = scope,
    sessionExpiresAt = Math.floor(now / 1000) + 3600
  ) =>
    issueRoomAdmission(
      target,
      async () => ({ id, sessionExpiresAt }),
      secret,
      clock
    );

  function request(token?: string | null) {
    const headers = new Headers({ upgrade: 'websocket' });
    if (token) headers.set('authorization', `Bearer ${token}`);
    return new Request('https://internal.invalid/room', { headers });
  }

  return {
    wake,
    mint,
    request,
    clock,
    writes: () => writes,
    sockets,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test('issues grants only from authorized account sessions, capped by the session lifetime', async () => {
  const f = fixture();
  assert.equal(
    await issueRoomAdmission(scope, async () => null, secret, f.clock),
    null
  );
  assert.equal(await f.mint('test-account', scope, start / 1000), null);
  const token = await f.mint('test-account', scope, start / 1000 + 50);
  assert.ok(token);
  assert.deepEqual(await verifyRoomAdmission(token, secret, f.clock), {
    ...scope,
    actorId: 'test-account',
    issuedAt: start / 1000,
    expiresAt: start / 1000 + 30,
    leaseUntil: start / 1000 + 50,
  });
  f.advance(30_000);
  assert.equal(await verifyRoomAdmission(token, secret, f.clock), null);
});

test('rejects missing, tampered and wrong-scope admissions before upgrading', async () => {
  const f = fixture();
  const room = f.wake();
  assert.equal((await room.fetch(f.request())).status, 401);
  const token = await f.mint('test-account');
  assert.ok(token);
  const tampered = (token[0] === 'a' ? 'b' : 'a') + token.slice(1);
  assert.equal((await room.fetch(f.request(tampered))).status, 401);

  for (const target of [
    { ...scope, worldId: 'another-world' },
    { ...scope, revision: 'another-revision' },
    { ...scope, shard: 1 },
  ]) {
    assert.equal(
      (await room.fetch(f.request(await f.mint('test-account', target))))
        .status,
      403
    );
  }
  assert.equal(f.sockets.length, 0);
});

test('enforces actor uniqueness and room capacity across concurrent admission and wake', async () => {
  const f = fixture();
  let room = f.wake();
  const token = await f.mint('duplicate-account');
  const duplicate = await Promise.all([
    room.fetch(f.request(token)),
    room.fetch(f.request(token)),
  ]);
  assert.deepEqual(duplicate.map((r) => r.status).sort(), [200, 409]);
  room = f.wake();
  const requests = await Promise.all(
    Array.from({ length: ROOM_CAPACITY + 1 }, (_, index) =>
      f.mint(`acct-${index}`)
    )
  );
  const responses = await Promise.all(
    requests.map((ticket) => room.fetch(f.request(ticket)))
  );
  assert.equal(
    responses.filter((response) => response.status === 200).length,
    ROOM_CAPACITY - 1
  );
  assert.equal(
    responses.filter((response) => response.status === 429).length,
    2
  );
  assert.equal(f.sockets.length, ROOM_CAPACITY);
  assert.equal(f.writes(), 0);
  for (const socket of f.sockets) {
    const [ready, ...updates] = socket.events;
    assert.ok(ready?.type === 'ready');
    assert.equal(ready.peers.length + updates.length, ROOM_CAPACITY - 1);
  }
});

test('scopes peer updates in both directions after wake and hides account identifiers', async () => {
  const f = fixture();
  let room = f.wake();
  for (const id of ['first-account', 'second-account']) {
    assert.equal((await room.fetch(f.request(await f.mint(id)))).status, 200);
  }
  const [first, second] = f.sockets;
  assert.ok(first && second);
  const ready = first.events[0];
  assert.ok(ready?.type === 'ready');
  assert.ok(
    !JSON.stringify([first.events, second.events]).includes('-account')
  );

  const move = async (x: number) => {
    f.advance(250);
    await room.webSocketMessage(
      first,
      JSON.stringify({ type: 'move', x, z: 0 })
    );
  };
  for (let i = 1; i <= 8; i += 1) await move(i * 1.5);
  room = f.wake();
  await move(13.5);
  assert.deepEqual(second.events.at(-1), { type: 'leave', id: ready.self.id });
  const prior = second.events.length;
  await move(15);
  assert.equal(second.events.length, prior);
  await move(13.5);
  await move(12);
  assert.deepEqual(second.events.at(-1), {
    type: 'peer',
    peer: { ...ready.self, x: 12 },
  });
  assert.equal(first.events.at(-1)?.type, 'peer');
  await room.webSocketClose(first, 1000, 'Left room');
  assert.equal(first.code, 1000);
  assert.deepEqual(second.events.at(-1), { type: 'leave', id: ready.self.id });
  assert.equal(f.writes(), 0);
});

test('keeps movement authoritative and preserves the rate limit through hibernation', async () => {
  const f = fixture({
    ...defaultWorld,
    objects: [
      {
        id: 'wall',
        kind: 'fixture',
        x: 0.7,
        z: 0,
        width: 0.1,
        depth: 1,
        elevation: 0,
        heading: 0,
      },
    ],
  });
  let room = f.wake();
  await room.fetch(f.request(await f.mint('test-account')));
  const [socket] = f.sockets;
  assert.ok(socket);
  const initial = socket.events[0];
  assert.ok(initial?.type === 'ready');

  f.advance(250);
  for (const x of [1.4, 50, -1]) {
    await room.webSocketMessage(
      socket,
      JSON.stringify({ type: 'move', x, z: 0 })
    );
    assert.deepEqual(socket.events.at(-1), {
      type: 'position',
      self: initial.self,
    });
  }
  await room.webSocketMessage(socket, '{"type":"move","x":0,"z":1}');
  assert.deepEqual(socket.events.at(-1), {
    type: 'position',
    self: { ...initial.self, z: 1 },
  });
  room = f.wake();
  for (let i = 4; i <= MAX_FRAMES_PER_SECOND; i += 1) {
    await room.webSocketMessage(socket, '{"type":"move","x":0,"z":1}');
  }
  assert.equal(socket.code, 1008);
  assert.equal(socket.attachment, null);
});

test('rejects identity-bearing, binary and oversized frames and expires leases after wake', async () => {
  const f = fixture();
  let room = f.wake();
  const invalid = [
    '{"type":"move","x":0,"z":0,"actorId":"other-account"}',
    new ArrayBuffer(20),
    '{"type":"move","x":0,"z":0}' + ' '.repeat(260),
  ];
  for (const [index, frame] of invalid.entries()) {
    await room.fetch(f.request(await f.mint(`actor-${index}`)));
    const socket = f.sockets.at(-1);
    assert.ok(socket);
    await room.webSocketMessage(socket, frame);
    assert.equal(socket.code, 1008);
  }
  await room.fetch(
    f.request(await f.mint('short-session', scope, start / 1000 + 1))
  );
  const socket = f.sockets.at(-1);
  assert.ok(socket);
  room = f.wake();
  f.advance(1000);
  await room.webSocketMessage(socket, '{"type":"move","x":0,"z":0}');
  assert.equal(socket.code, 1008);
});

test('durably closes admission and stops fan-out across a restart', async () => {
  const f = fixture();
  const room = f.wake();
  const token = await f.mint('test-account');
  await room.fetch(f.request(token));
  await Promise.all([room.stop(), room.stop()]);
  assert.equal(f.writes(), 1);
  assert.equal(f.sockets[0]?.code, 1001);
  const woke = f.wake();
  assert.equal((await woke.fetch(f.request(token))).status, 503);
  await woke.stop();
  assert.equal(f.writes(), 1);
  assert.equal(f.sockets.length, 1);
});

test('removes expired neighbors from an active mover after wake', async () => {
  const f = fixture();
  let room = f.wake();
  await room.fetch(f.request(await f.mint('active-account')));
  await room.fetch(
    f.request(await f.mint('short-account', scope, start / 1000 + 1))
  );
  const [active, expired] = f.sockets;
  const ready = expired?.events[0];
  assert.ok(active && expired && ready?.type === 'ready');
  room = f.wake();
  f.advance(1_000);
  await room.webSocketMessage(active, '{"type":"move","x":1,"z":0}');
  assert.equal(expired.code, 1008);
  assert.deepEqual(active.events.at(-2), { type: 'leave', id: ready.self.id });
});
