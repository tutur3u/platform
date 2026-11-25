import assert from 'node:assert/strict';
import { jest, test } from 'bun:test';
import { signRealtimePayload } from '../../../packages/realtime/src/core/token';
import {
  fixture,
  full,
  installRoomTestHooks,
  open,
  SECRET,
  ticket,
  useRoomFakeTimers,
} from './whiteboard-room-do.fixtures';

installRoomTestHooks();

const guest = { userId: 'g1', actorKind: 'guest' } as const;
const draw = (id: string) =>
  JSON.stringify({
    type: 'elements',
    changes: [{ type: 'insert', element: full(id) }],
  });
/** Every switch value that must keep guests view-only. */
const HELD = [undefined, 'false', '', '1', 'TRUE', ' true', 'yes'];

test('refuses and closes a guest edit ticket while guest drawing is held', async () => {
  for (const value of HELD) {
    const f = fixture({ MEET_GUEST_WHITEBOARD_DRAW: value });
    const member = await open(f);
    // The Meet API would mint view; a signed edit ticket still cannot write.
    const socket = await open(f, { ...guest, role: 'edit' });
    assert.equal(socket.sent[0].type, 'sync');
    assert.equal(socket.sent[0].role, 'view');
    await f.the.webSocketMessage(socket as any, draw('g'));
    assert.equal(socket.closed, 1008, String(value));
    assert.ok(!member.sent.some((m) => m.type === 'elements'));
    // The refused element never reached the scene a later joiner gets.
    const later = await open(f, { userId: 'u2' });
    assert.ok(!later.sent[0].elements.some((e: any) => e.id === 'g'));
  }
});

test('shows a held guest as a viewer in presence', async () => {
  useRoomFakeTimers();
  const f = fixture({ MEET_GUEST_WHITEBOARD_DRAW: undefined });
  const member = await open(f);
  await open(f, { ...guest, role: 'edit' });
  jest.advanceTimersByTime(1000);
  const presence = member.sent.filter((m) => m.type === 'presence').at(-1);
  assert.deepEqual(
    presence.members.map((m: { role: string }) => m.role).sort(),
    ['edit', 'view']
  );
});

test('a signed refresh cannot upgrade a held guest to edit', async () => {
  useRoomFakeTimers();
  const f = fixture({ MEET_GUEST_WHITEBOARD_DRAW: 'false' });
  const member = await open(f);
  const socket = await open(f, { ...guest, role: 'view' });
  jest.advanceTimersByTime(1000);
  await f.the.webSocketMessage(
    socket as any,
    JSON.stringify({
      type: 'authenticate',
      token: signRealtimePayload(ticket({ ...guest, role: 'edit' }), SECRET),
    })
  );
  assert.equal(socket.closed, null);
  assert.ok(!socket.sent.some((m) => m.type === 'role' && m.role === 'edit'));
  jest.advanceTimersByTime(1000);
  assert.equal(member.sent.filter((m) => m.type === 'presence').length, 1);
  await f.the.webSocketMessage(socket as any, draw('g'));
  assert.equal(socket.closed, 1008);
});

test('rechecks the hold at write time for an already accepted socket', async () => {
  const on = fixture();
  const socket = await open(on, { ...guest, role: 'edit' });
  // The same socket and attachment, served by a room whose switch is off,
  // as after a redeploy that holds guest drawing.
  const held = fixture({ MEET_GUEST_WHITEBOARD_DRAW: undefined });
  await held.the.webSocketMessage(socket as any, draw('g'));
  assert.equal(socket.closed, 1008);
});

test('lets a guest edit ticket draw once guest drawing is on', async () => {
  const f = fixture({ MEET_GUEST_WHITEBOARD_DRAW: 'true' });
  const member = await open(f);
  const socket = await open(f, { ...guest, role: 'edit' });
  assert.equal(socket.sent[0].role, 'edit');
  await f.the.webSocketMessage(socket as any, draw('g'));
  assert.equal(socket.closed, null);
  assert.equal(member.sent.at(-1).type, 'elements');
  assert.equal(member.sent.at(-1).changes[0].element.id, 'g');
});

test('leaves members drawing whatever the guest switch says', async () => {
  for (const value of [undefined, 'false', 'true']) {
    const f = fixture({ MEET_GUEST_WHITEBOARD_DRAW: value });
    const editor = await open(f);
    const peer = await open(f, { userId: 'u2' });
    await f.the.webSocketMessage(editor as any, draw('m'));
    assert.equal(editor.closed, null, String(value));
    assert.equal(peer.sent.at(-1).changes[0].element.id, 'm');
  }
});
