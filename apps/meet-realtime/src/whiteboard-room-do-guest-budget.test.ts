import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  clock,
  fixture,
  full,
  installRoomTestHooks,
  open,
} from './whiteboard-room-do.fixtures';

installRoomTestHooks();

/** About 4,775 render cost: a large hachure fill with a thin stroke. */
const heavy = (id: string, version = 1) =>
  full(id, {
    version,
    width: 6000,
    height: 6000,
    strokeWidth: 0.5,
    fillStyle: 'hachure',
    backgroundColor: '#ffc9c9',
  });

test('cuts a costly guest batch short but relays members', async () => {
  const f = fixture();
  const guest = await open(f, { userId: 'g1', actorKind: 'guest' });
  const member = await open(f, { userId: 'u2' });
  // 60 shapes of about 4,775 each, on a full-size canvas each, pass the
  // guest's churn bucket and the scene's cost and canvas area budgets;
  // board-sync-cost.test.ts covers each budget alone.
  const fills = (prefix: string) =>
    Array.from({ length: 60 }, (_, i) => ({
      type: 'insert',
      element: heavy(`${prefix}${i}`),
    }));
  await f.the.webSocketMessage(
    guest as any,
    JSON.stringify({ type: 'elements', changes: fills('g') })
  );
  assert.deepEqual(guest.sent.at(-1), { type: 'rejected', reason: 'size' });
  const relayed = member.sent.findLast((m) => m.type === 'elements');
  assert.ok(relayed.changes.length < 60);
  // Members are not held to it.
  await f.the.webSocketMessage(
    member as any,
    JSON.stringify({ type: 'elements', changes: fills('m') })
  );
  assert.equal(guest.sent.at(-1).changes.length, 60);
});

test('spends a guest churn bucket on every re-sent shape, across eviction', async () => {
  const f = fixture();
  const guest = await open(f, { userId: 'g1', actorKind: 'guest' });
  const send = (the: typeof f.the, version: number) =>
    the.webSocketMessage(
      guest as any,
      JSON.stringify({
        type: 'elements',
        changes: [{ type: 'insert', element: heavy('same', version) }],
      })
    );
  // 40,000 tokens buy eight copies of a 4,775 shape.
  for (let version = 1; version <= 8; version++) await send(f.the, version);
  assert.equal(
    guest.sent.some((m) => m.type === 'rejected'),
    false
  );
  await send(f.the, 9);
  assert.deepEqual(guest.sent.at(-1), { type: 'rejected', reason: 'size' });
  // The bucket rides in the socket attachment, so an eviction keeps it.
  const restored = f.restart();
  guest.sent.length = 0;
  await send(restored, 10);
  assert.deepEqual(guest.sent.at(-1), { type: 'rejected', reason: 'size' });
  // Two seconds refill 8,000 tokens: one more copy applies.
  clock.now += 2000;
  guest.sent.length = 0;
  await send(restored, 11);
  assert.equal(
    guest.sent.some((m) => m.type === 'rejected'),
    false
  );
  assert.equal(guest.closed, null);
});

test('holds every guest on the board to one shared churn bucket', async () => {
  const f = fixture();
  const guests = [];
  for (let i = 1; i <= 4; i++)
    guests.push(await open(f, { userId: `g${i}`, actorKind: 'guest' }));
  const send = (guest: (typeof guests)[number], id: string, version: number) =>
    f.the.webSocketMessage(
      guest as any,
      JSON.stringify({
        type: 'elements',
        changes: [{ type: 'insert', element: heavy(id, version) }],
      })
    );
  // Three guests each spend 38,200 of their own 40,000: 114,600 of the
  // board's 120,000.
  for (const [i, guest] of guests.slice(0, 3).entries())
    for (let version = 1; version <= 8; version++)
      await send(guest, `g${i}`, version);
  assert.equal(
    guests.some((guest) => guest.sent.some((m) => m.type === 'rejected')),
    false
  );
  // The fourth guest's own bucket is full, but the board has 5,400 left.
  const fourth = guests[3]!;
  await send(fourth, 'g3', 1);
  assert.equal(
    fourth.sent.some((m) => m.type === 'rejected'),
    false
  );
  await send(fourth, 'g3', 2);
  assert.deepEqual(fourth.sent.at(-1), { type: 'rejected', reason: 'size' });
  // One second refills 12,000 to the board.
  clock.now += 1000;
  fourth.sent.length = 0;
  await send(fourth, 'g3', 3);
  assert.equal(
    fourth.sent.some((m) => m.type === 'rejected'),
    false
  );
});
