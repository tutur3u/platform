import assert from 'node:assert/strict';
import { beforeEach, jest, test } from 'bun:test';
import { signRealtimePayload } from '../../../packages/realtime/src/core/token';
import { boardActorId } from '../../../packages/realtime/src/meet/board-sync-actor';
import {
  BOARD_GUEST_LIMITS,
  BOARD_LIMITS,
  type BoardMember,
} from '../../../packages/realtime/src/meet/board-sync-schema';
import {
  fixture,
  ids,
  installRoomTestHooks,
  open,
  SECRET,
  ticket,
  useRoomFakeTimers,
} from './whiteboard-room-do.fixtures';

installRoomTestHooks();
beforeEach(useRoomFakeTimers);

type Socket = Awaited<ReturnType<typeof open>>;

/** A selection naming `count` element ids of 63 characters each. */
const selection = (count: number, tag = 0) =>
  JSON.stringify({
    type: 'selection',
    selectedElementIds: Object.fromEntries(
      Array.from({ length: count }, (_, i) => [
        `${'x'.repeat(56)}${tag}-${String(i).padStart(4, '0')}`,
        true,
      ])
    ),
  });
const cursor = (x: number) => JSON.stringify({ type: 'cursor', x, y: 1 });
const relays = (socket: Socket) =>
  socket.sent.filter((m) => m.type === 'cursor' || m.type === 'selection');
const presence = (socket: Socket) =>
  socket.sent.filter((m) => m.type === 'presence');
/** Bytes the room sent as cursor and selection relays, across the fanout. */
const relayedBytes = (sockets: readonly Socket[]) =>
  sockets
    .flatMap(relays)
    .reduce(
      (sum, message) =>
        sum + new TextEncoder().encode(JSON.stringify(message)).length,
      0
    );

test('holds a guest flood to the board relay byte budget', async () => {
  const f = fixture();
  const members: Socket[] = [];
  const guests: Socket[] = [];
  for (let i = 0; i < 19; i++) members.push(await open(f, { userId: `m${i}` }));
  for (let i = 0; i < BOARD_GUEST_LIMITS.maxSockets; i++)
    guests.push(await open(f, { userId: `g${i}`, actorKind: 'guest' }));
  const start = Date.now();
  // Two seconds of every guest sending a full selection each step and a
  // cursor every other step, under the guest message rate.
  for (let step = 0; step < 20; step++) {
    for (const [i, guest] of guests.entries()) {
      await f.message(guest, selection(100, i));
      if (step % 2 === 0) await f.message(guest, cursor(step));
    }
    jest.advanceTimersByTime(BOARD_GUEST_LIMITS.relayIntervalMs);
  }
  for (const guest of guests) assert.equal(guest.closed, null);
  const seconds = (Date.now() - start) / 1000;
  const budget =
    BOARD_GUEST_LIMITS.relayBytesCapacity +
    BOARD_GUEST_LIMITS.relayBytesPerSecond * seconds;
  const sent = relayedBytes([...members, ...guests]);
  assert.ok(sent > 0);
  assert.ok(sent <= budget, `${sent} bytes over a ${budget} byte budget`);
});

test('drains the latest held guest cursor and leaves no relay timer armed', async () => {
  const f = fixture();
  const member = await open(f);
  const guest = await open(f, { userId: 'g1', actorKind: 'guest' });
  // Deliver the initial presence so its timer is outside the relay assertion.
  jest.advanceTimersByTime(1000);
  const baselineTimers = jest.getTimerCount();
  for (let x = 1; x <= 5; x++) await f.message(guest, cursor(x));
  assert.equal(relays(member).length, 1);
  assert.equal(jest.getTimerCount(), baselineTimers + 1);
  jest.advanceTimersByTime(BOARD_GUEST_LIMITS.relayIntervalMs);
  assert.deepEqual(
    relays(member).map((m) => m.x),
    [1, 5]
  );
  assert.equal(jest.getTimerCount(), baselineTimers);
});

test('clears both relay and presence timers when the last socket leaves', async () => {
  const f = fixture();
  await open(f);
  jest.advanceTimersByTime(1000);
  const baselineTimers = jest.getTimerCount();
  const guest = await open(f, { userId: 'g1', actorKind: 'guest' });
  await f.message(guest, cursor(1));
  await f.message(guest, cursor(2));
  assert.equal(jest.getTimerCount(), baselineTimers + 2);

  f.sockets.splice(0);
  await f.the.webSocketClose();
  assert.equal(jest.getTimerCount(), baselineTimers);
});

test('relays members at once while guests are held', async () => {
  const f = fixture();
  const member = await open(f);
  const peer = await open(f, { userId: 'u2' });
  const guest = await open(f, { userId: 'g1', actorKind: 'guest' });
  await f.message(guest, selection(100));
  const before = relays(peer).length;
  // In the same instant, the guest's cursors wait for its next relay and
  // the member's cursors and large selection go straight through.
  for (let x = 1; x <= 5; x++) {
    await f.message(guest, cursor(-x));
    await f.message(member, cursor(x));
  }
  await f.message(member, selection(400));
  const after = relays(peer).slice(before);
  assert.deepEqual(
    after.filter((m) => m.type === 'cursor').map((m) => m.x),
    [1, 2, 3, 4, 5]
  );
  assert.equal(
    Object.keys(after.find((m) => m.type === 'selection').selectedElementIds)
      .length,
    400
  );
});

test('refuses to relay a guest selection over the guest id cap', async () => {
  const f = fixture();
  const member = await open(f);
  const guest = await open(f, { userId: 'g1', actorKind: 'guest' });
  const cap = BOARD_GUEST_LIMITS.maxSelectionIds;
  await f.message(guest, selection(cap + 1));
  jest.advanceTimersByTime(BOARD_GUEST_LIMITS.relayIntervalMs);
  assert.equal(relays(member).length, 0);
  await f.message(guest, selection(cap));
  const [relayed] = relays(member);
  assert.equal(Object.keys(relayed.selectedElementIds).length, cap);
});

test('batches guest reconnect presence and bounds the bytes sent to a full room', async () => {
  const f = fixture();
  const displayName = '\u0000'.repeat(120); // Six JSON bytes per code unit.
  const member = await open(f, { displayName });
  const guest = { userId: 'returning-guest', displayName };
  const memberSeats = BOARD_LIMITS.maxSockets - BOARD_GUEST_LIMITS.maxSockets;
  for (let i = 1; i < memberSeats; i++)
    await open(f, { userId: `m${i}`, displayName });
  for (let i = 1; i < BOARD_GUEST_LIMITS.maxSockets; i++)
    await open(f, { userId: `g${i}`, displayName, actorKind: 'guest' });

  const limited = await open(f, { ...guest, actorKind: 'guest' });
  for (let i = 0; i <= BOARD_GUEST_LIMITS.messageRate; i++)
    await f.message(limited, '{"type":"sync"}');
  assert.equal(limited.closed, 1008);
  assert.equal(f.sockets.pop(), limited);
  await f.the.webSocketClose();
  await open(f, { ...guest, actorKind: 'guest' });

  jest.advanceTimersByTime(999);
  assert.equal(presence(member).length, 0);
  jest.advanceTimersByTime(1);
  assert.equal(f.sockets.length, BOARD_LIMITS.maxSockets);
  for (const socket of f.sockets) assert.equal(presence(socket).length, 1);
  const bytes = f.sockets
    .flatMap(presence)
    .reduce(
      (sum, message) => sum + Buffer.byteLength(JSON.stringify(message)),
      0
    );
  const boundedName = '\u0000'.repeat(64);
  const maxEntry = {
    id: 'x'.repeat(36), // A connection UUID when the board actor id is absent.
    displayName: boundedName,
    role: 'view',
  } satisfies BoardMember;
  const maxSnapshotBytes = Buffer.byteLength(
    JSON.stringify({
      type: 'presence',
      members: Array.from({ length: BOARD_LIMITS.maxSockets }, () => maxEntry),
    })
  );
  assert.ok(bytes <= maxSnapshotBytes * BOARD_LIMITS.maxSockets);
  const [first] = presence(member);
  const guestId = boardActorId(SECRET, ids.boardId, guest.userId);
  assert.equal(first.members.length, BOARD_LIMITS.maxSockets);
  for (const entry of first.members)
    assert.equal(entry.displayName, boundedName);
  assert.ok(first.members.some((entry: BoardMember) => entry.id === guestId));

  f.sockets.pop();
  await f.the.webSocketClose();
  await open(f, { ...guest, actorKind: 'guest' });
  f.sockets.pop();
  await f.the.webSocketClose();
  jest.advanceTimersByTime(999);
  assert.equal(presence(member).length, 1);
  jest.advanceTimersByTime(1);
  assert.equal(presence(member).length, 2);
  assert.deepEqual(
    presence(member)[1].members,
    first.members.filter((entry: BoardMember) => entry.id !== guestId)
  );
});

test('truncates presence display names by UTF-8 bytes at code point boundaries', async () => {
  const f = fixture();
  const codePoint = '\u{1f600}';
  const short = 'a'.repeat(61);
  const exact = `${'b'.repeat(60)}${codePoint}`;
  const member = await open(f, { displayName: `${short}${codePoint}z` });
  const guest = await open(f, {
    userId: 'g1',
    actorKind: 'guest',
    displayName: `${exact}z`,
  });

  jest.advanceTimersByTime(1000);
  const [snapshot] = presence(member);
  assert.deepEqual(
    snapshot.members.map((entry: BoardMember) => entry.displayName),
    [short, exact]
  );
  await f.message(member, cursor(1));
  await f.message(guest, cursor(2));
  assert.equal(relays(guest)[0].displayName, short);
  assert.equal(relays(member)[0].displayName, exact);
});

test('keeps a burst of concurrent joins within the presence fanout cap', async () => {
  const f = fixture();
  const results = await Promise.all(
    Array.from({ length: BOARD_LIMITS.maxSockets + 5 }, (_, i) =>
      f.join({ userId: `member-${i}` })
    )
  );
  assert.equal(f.sockets.length, BOARD_LIMITS.maxSockets);
  assert.equal(results.filter((response) => response.status === 429).length, 5);
  jest.advanceTimersByTime(1000);
  for (const socket of f.sockets) {
    const [snapshot] = presence(socket);
    assert.equal(snapshot.members.length, BOARD_LIMITS.maxSockets);
  }
});

test('batches presence on refresh only when the honoured role changes', async () => {
  const f = fixture();
  const member = await open(f);
  const guest = await open(f, { userId: 'g1', actorKind: 'guest' });
  jest.advanceTimersByTime(1000);
  assert.equal(presence(member).length, 1);

  const refresh = (role: 'edit' | 'view') =>
    f.message(
      guest,
      JSON.stringify({
        type: 'authenticate',
        token: signRealtimePayload(
          ticket({ userId: 'g1', actorKind: 'guest', role }),
          SECRET
        ),
      })
    );
  await refresh('edit');
  jest.advanceTimersByTime(1000);
  assert.equal(presence(member).length, 1);
  assert.equal(guest.sent.filter((m) => m.type === 'role').length, 0);

  await refresh('view');
  await refresh('view');
  assert.deepEqual(
    guest.sent.filter((m) => m.type === 'role'),
    [{ type: 'role', role: 'view' }]
  );
  jest.advanceTimersByTime(1000);
  assert.equal(presence(member).length, 2);
  assert.deepEqual(
    presence(member)[1].members.map((entry: BoardMember) => entry.role),
    ['edit', 'view']
  );
});
