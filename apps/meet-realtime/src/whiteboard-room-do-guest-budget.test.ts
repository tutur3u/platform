import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { guestElement } from '../../../packages/realtime/src/meet/board-sync-guest.fixtures';
import {
  clock,
  fixture,
  full,
  installRoomTestHooks,
  open,
} from './whiteboard-room-do.fixtures';

installRoomTestHooks();

/**
 * About 4,775 render cost, a large hachure fill with a thin stroke, on a
 * full-size canvas: each applied copy spends 8,871 churn (4,096 for the
 * canvas every viewer redraws).
 */
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
  // board-sync-cost.test.ts and board-sync-canvas.test.ts cover each alone.
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
  // 40,000 tokens buy four copies at 8,871: 4,516 remain.
  for (let version = 1; version <= 4; version++) await send(f.the, version);
  assert.equal(
    guest.sent.some((m) => m.type === 'rejected'),
    false
  );
  await send(f.the, 5);
  assert.deepEqual(guest.sent.at(-1), { type: 'rejected', reason: 'size' });
  // The bucket rides in the socket attachment, so an eviction keeps it.
  const restored = f.restart();
  guest.sent.length = 0;
  await send(restored, 6);
  assert.deepEqual(guest.sent.at(-1), { type: 'rejected', reason: 'size' });
  // Two seconds refill 8,000 tokens: one more copy applies.
  clock.now += 2000;
  guest.sent.length = 0;
  await send(restored, 7);
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
  // Every guest re-sends one shared shape, so only churn grows: the scene's
  // seed element (no size, so counted as a full canvas) and this shape stay
  // well inside the canvas area budget. Three guests each spend 35,484 of
  // their own 40,000: 106,452 of the board's 120,000.
  let version = 0;
  for (const guest of guests.slice(0, 3))
    for (let copy = 0; copy < 4; copy++) await send(guest, 'shared', ++version);
  assert.equal(
    guests.some((guest) => guest.sent.some((m) => m.type === 'rejected')),
    false
  );
  // The fourth guest's own bucket is full, but the board has 13,548 left.
  const fourth = guests[3]!;
  await send(fourth, 'shared', ++version);
  assert.equal(
    fourth.sent.some((m) => m.type === 'rejected'),
    false
  );
  await send(fourth, 'shared', ++version);
  assert.deepEqual(fourth.sent.at(-1), { type: 'rejected', reason: 'size' });
  // One second refills 12,000 to the board.
  clock.now += 1000;
  fourth.sent.length = 0;
  await send(fourth, 'shared', ++version);
  assert.equal(
    fourth.sent.some((m) => m.type === 'rejected'),
    false
  );
});

test('relays a guest arrow without its text labels', async () => {
  const f = fixture();
  const guest = await open(f, { userId: 'g1', actorKind: 'guest' });
  const peer = await open(f, { userId: 'u2' });
  const arrow = guestElement('arrow', {
    id: 'a',
    boundElements: [{ id: 'a', type: 'text' }],
  });
  await f.the.webSocketMessage(
    guest as any,
    JSON.stringify({
      type: 'elements',
      changes: [{ type: 'insert', element: arrow }],
    })
  );
  const relayed = peer.sent.findLast((m) => m.type === 'elements');
  assert.deepEqual(relayed.changes[0].element.boundElements, []);
});
