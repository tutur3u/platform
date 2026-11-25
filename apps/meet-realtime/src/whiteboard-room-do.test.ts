import assert from 'node:assert/strict';
import { jest, spyOn, test } from 'bun:test';
import { signRealtimePayload } from '../../../packages/realtime/src/core/token';
import { boardActorId } from '../../../packages/realtime/src/meet/board-sync-actor';
import { guestElement } from '../../../packages/realtime/src/meet/board-sync-guest.fixtures';
import {
  BOARD_GUEST_LIMITS,
  BOARD_LIMITS,
  type BoardTicket,
} from '../../../packages/realtime/src/meet/board-sync-schema';
import {
  clock,
  fixture,
  full,
  ids,
  installRoomTestHooks,
  open,
  rect,
  SECRET,
  ticket,
  useRoomFakeTimers,
} from './whiteboard-room-do.fixtures';

installRoomTestHooks();

test('loads the board once and sends the scene to a joiner', async () => {
  const f = fixture();
  const socket = await open(f);
  assert.equal(socket.sent[0].type, 'sync');
  assert.deepEqual(
    socket.sent[0].elements.map((e: any) => e.id),
    ['seed']
  );
  await open(f, { userId: 'u2' });
  assert.deepEqual((globalThis as any).__fetches, ['load']);
});

test('refuses an expired or unsigned join and a different board', async () => {
  const f = fixture();
  const expired = await f.join({ exp: Math.floor(clock.now / 1000) - 1 });
  assert.equal(expired.status, 401);
  await open(f);
  const other = await f.join({ boardId: crypto.randomUUID() });
  assert.equal(other.status, 403);
});

test('relays edits from editors and closes a viewer that edits', async () => {
  const f = fixture();
  const editor = await open(f);
  const peer = await open(f, { userId: 'u2' });
  const viewer = await open(f, { userId: 'u3', role: 'view' });
  const message = JSON.stringify({
    type: 'elements',
    changes: [{ type: 'insert', element: rect('a') }],
  });
  await f.the.webSocketMessage(editor as any, message);
  assert.equal(peer.sent.at(-1).type, 'elements');
  assert.equal(viewer.sent.at(-1).changes[0].element.id, 'a');
  assert.ok(!editor.sent.some((m) => m.type === 'elements'));
  await f.the.webSocketMessage(viewer as any, message);
  assert.equal(viewer.closed, 1008);
});

test('a refresh may lower the role but not change the actor', async () => {
  const f = fixture();
  const socket = await open(f);
  await f.the.webSocketMessage(
    socket as any,
    JSON.stringify({
      type: 'authenticate',
      token: signRealtimePayload(ticket({ role: 'view' }), SECRET),
    })
  );
  assert.ok(socket.sent.some((m) => m.type === 'role' && m.role === 'view'));
  // The lowered socket may no longer write: the write closes it, and nothing
  // reaches the room or the other people.
  const peer = await open(f, { userId: 'u3' });
  await f.the.webSocketMessage(
    socket as any,
    JSON.stringify({
      type: 'elements',
      changes: [{ type: 'insert', element: rect('lowered') }],
    })
  );
  assert.equal(socket.closed, 1008);
  assert.ok(!peer.sent.some((m) => m.type === 'elements'));
  const later = await open(f, { userId: 'u4' });
  assert.ok(!later.sent[0].elements.some((e: any) => e.id === 'lowered'));
  const other = await open(f, { userId: 'u9' });
  await f.the.webSocketMessage(
    other as any,
    JSON.stringify({
      type: 'authenticate',
      token: signRealtimePayload(ticket({ userId: 'someone-else' }), SECRET),
    })
  );
  assert.equal(other.closed, 1008);
});

test('rate limits a socket and rejects malformed messages', async () => {
  const f = fixture();
  const socket = await open(f);
  for (let i = 0; i <= BOARD_LIMITS.messageRate; i++)
    await f.the.webSocketMessage(
      socket as any,
      JSON.stringify({ type: 'cursor', x: 1, y: 1 })
    );
  assert.equal(socket.closed, 1008);
  const bad = await open(f, { userId: 'u2' });
  await f.the.webSocketMessage(bad as any, '{"type":"elements","changes":[]}');
  assert.equal(bad.closed, 1008);
});

test('flushes on the alarm after the last participant leaves', async () => {
  const f = fixture();
  const socket = await open(f);
  await f.the.webSocketMessage(
    socket as any,
    JSON.stringify({
      type: 'elements',
      changes: [{ type: 'insert', element: rect('a') }],
    })
  );
  f.sockets.splice(0);
  await f.the.webSocketClose();
  clock.now += BOARD_LIMITS.idleFlushMs + 10;
  await f.the.alarm();
  assert.deepEqual((globalThis as any).__fetches, ['load', 'flush']);
});

test('the stop fence halts flushes and storage writes but keeps relaying', async () => {
  const f = fixture({ MEET_WHITEBOARD_FLUSH_DISABLED: 'true' });
  const editor = await open(f);
  const peer = await open(f, { userId: 'u2' });
  for (let i = 0; i < 20; i++)
    await f.the.webSocketMessage(
      editor as any,
      JSON.stringify({
        type: 'elements',
        changes: [{ type: 'insert', element: rect(`e${i}`) }],
      })
    );
  assert.equal(peer.sent.filter((m) => m.type === 'elements').length, 20);
  clock.now += 60 * 60_000;
  await f.the.alarm();
  assert.deepEqual((globalThis as any).__fetches, ['load']);
  assert.equal(f.values.has('meta'), false);
});

test('the stop fence also keeps the identity out of storage until it lifts', async () => {
  const f = fixture({ MEET_WHITEBOARD_FLUSH_DISABLED: '1' });
  await open(f);
  assert.equal(f.values.has('identity'), false);
  assert.equal(f.ops.puts, 0);
});

test('stores the identity on the first join when the fence is off', async () => {
  const f = fixture();
  await open(f);
  assert.deepEqual(f.values.get('identity'), ids);
});

test('never delivers a broadcast to a socket whose ticket expired', async () => {
  const f = fixture();
  const editor = await open(f);
  const stale = await open(f, {
    userId: 'u2',
    exp: Math.floor(clock.now / 1000) + 5,
  });
  clock.now += 10_000;
  await f.the
    .webSocketMessage(
      editor as any,
      JSON.stringify({ type: 'cursor', x: 1, y: 1 })
    )
    .catch(() => undefined);
  assert.equal(stale.closed, 1008);
  assert.ok(!stale.sent.some((m) => m.type === 'cursor'));
});

test('after an eviction the restored room sweeps expired sockets without a new message', async () => {
  const f = fixture();
  await open(f);
  const stale = await open(f, {
    userId: 'u2',
    exp: Math.floor(clock.now / 1000) + 5,
  });
  const alarmsBefore = f.ops.alarms;
  const restored = f.restart();
  clock.now += 10_000;
  await restored.alarm();
  assert.ok(f.ops.alarms >= alarmsBefore);
  assert.equal(stale.closed, 1008);
});

test('a viewer may ask for the scene only once every two seconds', async () => {
  const f = fixture();
  const viewer = await open(f, { role: 'view' });
  const base = viewer.sent.filter((m) => m.type === 'sync').length;
  for (let i = 0; i < 5; i++)
    await f.the.webSocketMessage(viewer as any, '{"type":"sync"}');
  assert.equal(viewer.sent.filter((m) => m.type === 'sync').length, base + 1);
  clock.now += 2500;
  await f.the.webSocketMessage(viewer as any, '{"type":"sync"}');
  assert.equal(viewer.sent.filter((m) => m.type === 'sync').length, base + 2);
});

test('drops unsupported elements with a notice and keeps the socket open', async () => {
  const f = fixture();
  const editor = await open(f);
  const peer = await open(f, { userId: 'u2' });
  await f.the.webSocketMessage(
    editor as any,
    JSON.stringify({
      type: 'elements',
      changes: [
        { type: 'insert', element: { ...rect('img'), type: 'image' } },
        { type: 'insert', element: rect('ok') },
      ],
    })
  );
  assert.equal(editor.closed, null);
  assert.deepEqual(editor.sent.at(-1), {
    type: 'rejected',
    reason: 'unsupported',
  });
  assert.deepEqual(
    peer.sent.at(-1).changes.map((c: any) => c.element.id),
    ['ok']
  );
  await f.the.webSocketMessage(
    editor as any,
    JSON.stringify({
      type: 'elements',
      changes: [
        { type: 'insert', element: { ...rect('img2'), type: 'image' } },
      ],
    })
  );
  assert.equal(editor.closed, null);
});

test('tells the sender when the board is full and keeps the socket open', async () => {
  const f = fixture();
  const editor = await open(f);
  let refused = 0;
  for (let i = 0; i < 60; i++) {
    clock.now += 1000;
    await f.the.webSocketMessage(
      editor as any,
      JSON.stringify({
        type: 'elements',
        changes: [
          {
            type: 'insert',
            element: { ...rect(`big${i}`), text: 'x'.repeat(60_000) },
          },
        ],
      })
    );
    refused += editor.sent.filter((m) => m.type === 'rejected').length;
    editor.sent.length = 0;
  }
  assert.ok(refused > 0);
  assert.equal(editor.closed, null);
});

test('a room closed by the platform reopens at the next join once the board is back', async () => {
  const f = fixture();
  const editor = await open(f);
  (globalThis as any).__status = { flush: 404 };
  await f.the.webSocketMessage(
    editor as any,
    JSON.stringify({
      type: 'elements',
      changes: [{ type: 'insert', element: rect('a') }],
    })
  );
  f.sockets.splice(0);
  await f.the.webSocketClose();
  clock.now += BOARD_LIMITS.idleFlushMs + 10;
  await f.the.alarm();
  (globalThis as any).__status = { load: 404 };
  assert.equal((await f.join({ userId: 'u3' })).status, 410);
  assert.equal(f.sockets.length, 0);
  (globalThis as any).__status = {};
  const reopened = await open(f, { userId: 'u3' });
  assert.equal(reopened.sent[0].type, 'sync');
});

test('holds a guest to half the message rate of a member', async () => {
  const f = fixture();
  const member = await open(f);
  const guest = await open(f, { userId: 'g1', actorKind: 'guest' });
  for (let i = 0; i <= BOARD_GUEST_LIMITS.messageRate; i++)
    for (const socket of [member, guest])
      await f.the.webSocketMessage(
        socket as any,
        JSON.stringify({ type: 'cursor', x: 1, y: 1 })
      );
  assert.equal(guest.closed, 1008);
  assert.equal(member.closed, null);
});

test('refuses a guest message above the guest size budget', async () => {
  const f = fixture();
  const message = JSON.stringify({
    type: 'elements',
    changes: Array.from({ length: 5 }, (_, i) => ({
      type: 'insert',
      element: { ...rect(`wide${i}`), text: 'x'.repeat(60_000) },
    })),
  });
  assert.ok(message.length > BOARD_GUEST_LIMITS.maxMessageBytes);
  const guest = await open(f, { userId: 'g1', actorKind: 'guest' });
  await f.the.webSocketMessage(guest as any, message);
  assert.equal(guest.closed, 1009);
  const member = await open(f, { userId: 'u2' });
  await f.the.webSocketMessage(member as any, message);
  assert.equal(member.closed, null);
});

test('caps the sockets one guest may hold on a board', async () => {
  const f = fixture();
  for (let i = 0; i < BOARD_GUEST_LIMITS.socketsPerUser; i++)
    await open(f, { userId: 'g1', actorKind: 'guest' });
  const refused = await f.join({ userId: 'g1', actorKind: 'guest' });
  assert.equal(refused.status, 429);
  assert.equal(f.sockets.length, BOARD_GUEST_LIMITS.socketsPerUser);
  await open(f, { userId: 'g2', actorKind: 'guest' });
  assert.equal(f.sockets.length, BOARD_GUEST_LIMITS.socketsPerUser + 1);
});

test('closes a guest viewer that tries to draw', async () => {
  const f = fixture();
  const viewer = await open(f, {
    userId: 'g1',
    actorKind: 'guest',
    role: 'view',
  });
  await f.the.webSocketMessage(
    viewer as any,
    JSON.stringify({
      type: 'elements',
      changes: [{ type: 'insert', element: rect('a') }],
    })
  );
  assert.equal(viewer.closed, 1008);
});

test('limits how often one guest may reopen a board socket', async () => {
  const f = fixture();
  const guest = { userId: 'g1', actorKind: 'guest' } as const;
  for (let i = 0; i < BOARD_GUEST_LIMITS.opensPerMinute; i++) {
    await open(f, guest);
    f.sockets.splice(0);
  }
  assert.equal((await f.join(guest)).status, 429);
  assert.equal(f.sockets.length, 0);
  // Members reopen freely; the guest may again a minute later.
  for (let i = 0; i < 10; i++) {
    await open(f);
    f.sockets.splice(0);
  }
  clock.now += 60_000;
  await open(f, guest);
  assert.equal(f.sockets.length, 1);
});

test('keeps member seats free when guests crowd a board', async () => {
  const f = fixture();
  for (let i = 0; i < BOARD_GUEST_LIMITS.maxSockets; i++)
    await open(f, { userId: `g${i}`, actorKind: 'guest' });
  const refused = await f.join({ userId: 'late', actorKind: 'guest' });
  assert.equal(refused.status, 429);
  await open(f, { userId: 'member' });
  assert.equal(f.sockets.length, BOARD_GUEST_LIMITS.maxSockets + 1);
});

async function joinDuringCheckpoint(
  f: ReturnType<typeof fixture>,
  joins: Partial<BoardTicket>[]
) {
  const started = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  const fetch = globalThis.fetch;
  const delayed = spyOn(globalThis, 'fetch').mockImplementationOnce(
    async (...args) => {
      started.resolve();
      await resume.promise;
      return fetch(...args);
    }
  );
  try {
    const attempts = joins.map((join) => f.join(join));
    await started.promise;
    assert.equal(f.sockets.length, 0);
    resume.resolve();
    return await Promise.all(attempts);
  } finally {
    resume.resolve();
    delayed.mockRestore();
  }
}

test('reserves every member seat during a guest burst on the first checkpoint', async () => {
  useRoomFakeTimers();
  const f = fixture();
  const burst = BOARD_GUEST_LIMITS.maxSockets + 10;
  const results = await joinDuringCheckpoint(
    f,
    Array.from({ length: burst }, (_, i) => ({
      userId: `guest-${i}`,
      actorKind: 'guest',
    }))
  );
  assert.equal(f.sockets.length, BOARD_GUEST_LIMITS.maxSockets);
  const refused = results.filter((response) => response.status === 429);
  assert.equal(refused.length, burst - BOARD_GUEST_LIMITS.maxSockets);
  for (const response of refused)
    assert.equal(await response.text(), 'Room full');

  const reservedSeats = BOARD_LIMITS.maxSockets - BOARD_GUEST_LIMITS.maxSockets;
  for (let i = 0; i < reservedSeats; i++)
    await open(f, { userId: `member-${i}` });
  assert.equal(f.sockets.length, BOARD_LIMITS.maxSockets);
});

test('enforces the per-user socket cap after a shared first checkpoint', async () => {
  useRoomFakeTimers();
  const f = fixture();
  const results = await joinDuringCheckpoint(
    f,
    Array.from({ length: BOARD_GUEST_LIMITS.socketsPerUser + 1 }, () => ({
      userId: 'guest',
      actorKind: 'guest',
    }))
  );
  assert.equal(f.sockets.length, BOARD_GUEST_LIMITS.socketsPerUser);
  const refused = results.filter((response) => response.status === 429);
  assert.equal(refused.length, 1);
  assert.equal(await refused[0].text(), 'Too many connections');
});

test('names people by a per-board id, never their user id', async () => {
  useRoomFakeTimers();
  const f = fixture();
  const member = await open(f, { userId: 'member-user-id' });
  const guest = await open(f, { userId: 'g1', actorKind: 'guest' });
  jest.advanceTimersByTime(1000);
  const actor = boardActorId(SECRET, ids.boardId, 'member-user-id');
  const presence = guest.sent.findLast((m) => m.type === 'presence');
  assert.deepEqual(
    presence.members.map((m: any) => m.id),
    [actor, boardActorId(SECRET, ids.boardId, 'g1')]
  );
  await f.the.webSocketMessage(
    member as any,
    JSON.stringify({ type: 'cursor', x: 1, y: 1 })
  );
  assert.equal(guest.sent.at(-1).senderId, actor);
  assert.ok(!JSON.stringify(guest.sent).includes('member-user-id'));
});

test('stores only known fields and safe links from guests', async () => {
  const f = fixture();
  const guest = await open(f, { userId: 'g1', actorKind: 'guest' });
  const peer = await open(f, { userId: 'u2' });
  const element = (id: string, link: string) => ({
    ...full(id),
    link,
    customData: { tracker: true },
    sneaky: 'x',
  });
  await f.the.webSocketMessage(
    guest as any,
    JSON.stringify({
      type: 'elements',
      changes: [
        { type: 'insert', element: element('bad', 'javascript:alert(1)') },
        { type: 'insert', element: element('ok', 'https://example.com/a') },
      ],
    })
  );
  const [bad, ok] = peer.sent.at(-1).changes.map((c: any) => c.element);
  assert.equal(bad.link, null);
  assert.equal(ok.link, 'https://example.com/a');
  for (const stored of [bad, ok]) {
    assert.equal('customData' in stored, false);
    assert.equal('sneaky' in stored, false);
  }
  // A member's fields pass through as before.
  await f.the.webSocketMessage(
    peer as any,
    JSON.stringify({
      type: 'elements',
      changes: [{ type: 'insert', element: element('m', 'https://x.test') }],
    })
  );
  assert.equal(guest.sent.at(-1).changes[0].element.sneaky, 'x');
});

test('refuses guest elements whose known fields have the wrong type', async () => {
  const f = fixture();
  const guest = await open(f, { userId: 'g1', actorKind: 'guest' });
  const peer = await open(f, { userId: 'u2' });
  await f.the.webSocketMessage(
    guest as any,
    JSON.stringify({
      type: 'elements',
      changes: [
        { type: 'insert', element: { ...full('groups'), groupIds: {} } },
        { type: 'insert', element: { ...full('round'), roundness: 1 } },
        // Wrong-typed fields of the element's own type refuse it.
        {
          type: 'insert',
          element: guestElement('line', { id: 'points', points: 'x' }),
        },
        {
          type: 'insert',
          element: guestElement('text', { id: 'font', fontFamily: {} }),
        },
        // A field another type uses is stripped: the element's own type never
        // reads it, and it reaches neither the room nor other people.
        {
          type: 'insert',
          element: { ...full('fine'), points: 'x', fontFamily: {} },
        },
      ],
    })
  );
  const relayed = peer.sent.at(-1).changes.map((c: any) => c.element);
  assert.deepEqual(
    relayed.map((element: any) => element.id),
    ['fine']
  );
  assert.equal('points' in relayed[0], false);
  assert.equal('fontFamily' in relayed[0], false);
  assert.deepEqual(guest.sent.at(-1), {
    type: 'rejected',
    reason: 'unsupported',
  });
  assert.equal(guest.closed, null);
});

test('keeps the guest open limit across an eviction', async () => {
  const f = fixture();
  const guest = { userId: 'g1', actorKind: 'guest' } as const;
  for (let i = 0; i < BOARD_GUEST_LIMITS.opensPerMinute; i++) {
    await open(f, guest);
    f.sockets.splice(0);
  }
  const restored = f.restart();
  const response = await restored.fetch(
    new Request('https://x/whiteboard', {
      headers: {
        Upgrade: 'websocket',
        'x-board-ticket': JSON.stringify(ticket(guest)),
      },
    })
  );
  assert.equal(response.status, 429);
  assert.equal(f.sockets.length, 0);
});

test('the stop fence keeps the guest open windows out of storage', async () => {
  const f = fixture({ MEET_WHITEBOARD_FLUSH_DISABLED: 'true' });
  await open(f, { userId: 'g1', actorKind: 'guest' });
  assert.equal(f.values.has('guest-opens'), false);
});
