import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { BOARD_GUEST_LIMITS } from '../../../packages/realtime/src/meet/board-sync-schema';
import {
  clock,
  fixture,
  installRoomTestHooks,
  open,
} from './whiteboard-room-do.fixtures';

installRoomTestHooks();

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
  const start = clock.now;
  // Two seconds of every guest sending a full selection each step and a
  // cursor every other step, under the guest message rate.
  for (let step = 0; step < 20; step++) {
    for (const [i, guest] of guests.entries()) {
      await f.the.webSocketMessage(guest as any, selection(100, i));
      if (step % 2 === 0)
        await f.the.webSocketMessage(guest as any, cursor(step));
    }
    clock.now += BOARD_GUEST_LIMITS.relayIntervalMs;
    f.the.flushGuestRelays();
  }
  for (const guest of guests) assert.equal(guest.closed, null);
  const seconds = (clock.now - start) / 1000;
  const budget =
    BOARD_GUEST_LIMITS.relayBytesCapacity +
    BOARD_GUEST_LIMITS.relayBytesPerSecond * seconds;
  const sent = relayedBytes([...members, ...guests]);
  assert.ok(sent > 0);
  assert.ok(sent <= budget, `${sent} bytes over a ${budget} byte budget`);
});

test('coalesces a guest cursor to the latest between relays', async () => {
  const f = fixture();
  const member = await open(f);
  const guest = await open(f, { userId: 'g1', actorKind: 'guest' });
  for (let x = 1; x <= 5; x++)
    await f.the.webSocketMessage(guest as any, cursor(x));
  clock.now += BOARD_GUEST_LIMITS.relayIntervalMs;
  f.the.flushGuestRelays();
  assert.deepEqual(
    relays(member).map((m) => m.x),
    [1, 5]
  );
  // Nothing more is held, so a later flush relays nothing.
  clock.now += BOARD_GUEST_LIMITS.relayIntervalMs;
  f.the.flushGuestRelays();
  assert.equal(relays(member).length, 2);
});

test('relays members at once while guests are held', async () => {
  const f = fixture();
  const member = await open(f);
  const peer = await open(f, { userId: 'u2' });
  const guest = await open(f, { userId: 'g1', actorKind: 'guest' });
  await f.the.webSocketMessage(guest as any, selection(100));
  const before = relays(peer).length;
  // In the same instant, the guest's cursors wait for its next relay and
  // the member's cursors and large selection go straight through.
  for (let x = 1; x <= 5; x++) {
    await f.the.webSocketMessage(guest as any, cursor(-x));
    await f.the.webSocketMessage(member as any, cursor(x));
  }
  await f.the.webSocketMessage(member as any, selection(400));
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
  await f.the.webSocketMessage(guest as any, selection(cap + 1));
  clock.now += BOARD_GUEST_LIMITS.relayIntervalMs;
  f.the.flushGuestRelays();
  assert.equal(relays(member).length, 0);
  await f.the.webSocketMessage(guest as any, selection(cap));
  const [relayed] = relays(member);
  assert.equal(Object.keys(relayed.selectedElementIds).length, cap);
});
