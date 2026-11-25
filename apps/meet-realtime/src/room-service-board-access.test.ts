import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  type MeetRealtimeTokenPayload,
  meetRoomLimitsSchema,
} from '../../../packages/realtime/src/meet/primitives';
import {
  createMeetPresence,
  createMeetRoomSnapshot,
} from '../../../packages/realtime/src/meet/room';
import { roomService } from './room-service';

const guest = {
  accountId: 'guest',
  userId: 'guest',
  role: 'speaker',
  guest: true,
  scopes: ['meet:server'],
  limits: meetRoomLimitsSchema.parse({}),
} as MeetRealtimeTokenPayload;
const state = {
  ...createMeetRoomSnapshot(),
  presence: { guest: createMeetPresence(guest, '2026-11-25T00:00:00Z') },
};
const check = (connectedUsers?: ReadonlySet<string>) =>
  roomService(state, guest, { action: 'board.access' }, undefined, {
    connectedUsers,
  });

test('the room answers the board check only over an open socket', () => {
  assert.deepEqual(check(new Set(['guest'])).body, { ok: true });
  // Presence in the reconnect grace period has no open socket.
  assert.equal(check(new Set()).status, 403);
  // Without the room's socket list the check fails closed.
  assert.equal(check().status, 403);
});

test('the room refuses the board check from a browser token', () => {
  const browser = { ...guest, scopes: [] } as MeetRealtimeTokenPayload;
  const result = roomService(
    state,
    browser,
    { action: 'board.access' },
    undefined,
    { connectedUsers: new Set(['guest']) }
  );
  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: 'Board access denied' });
});
