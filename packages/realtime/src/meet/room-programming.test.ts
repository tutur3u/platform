import { expect, it } from 'vitest';
import type { MeetRealtimeTokenPayload } from './primitives';
import { applyRoomProgramming } from './room-programming';
import type { RoomServiceState } from './room-service';

const snapshot = {
  presence: {},
  settings: { shareNotes: false },
} as RoomServiceState;
const token = {
  accountId: 'guest',
  userId: 'guest',
  role: 'speaker',
  scopes: ['meet:server'],
} as MeetRealtimeTokenPayload;
it('requires admission even for a signed server caller', () =>
  expect(
    applyRoomProgramming(snapshot, token, { action: 'programming.read' })
      ?.status
  ).toBe(403));
it('allows admitted reading but restricts selection to the host', () => {
  const admitted = {
    ...snapshot,
    approved: { guest: { userId: 'guest', displayName: 'Guest' } },
  };
  expect(
    applyRoomProgramming(admitted, token, { action: 'programming.read' })?.body
  ).toEqual({ selection: null });
  expect(
    applyRoomProgramming(admitted, token, {
      action: 'programming.set',
      selection: null,
    })?.status
  ).toBe(403);
});
it('denies ended rooms and broadcasts authorized selections', () => {
  const host = { ...token, role: 'host' } as MeetRealtimeTokenPayload;
  expect(
    applyRoomProgramming({ ...snapshot, ended: true }, host, {
      action: 'programming.read',
    })?.status
  ).toBe(403);
  const selection = {
    kind: 'playground',
    id: '00000000-0000-4000-8000-000000000001',
    language: 'python',
  };
  expect(
    applyRoomProgramming(snapshot, host, {
      action: 'programming.set',
      selection,
    })?.messages?.[0]
  ).toMatchObject({
    type: 'room.settings',
    settings: { programming: selection },
  });
});
