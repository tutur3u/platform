import { describe, expect, it } from 'vitest';
import {
  type MeetRealtimeTokenPayload,
  meetRoomLimitsSchema,
} from './primitives';
import { createMeetPresence, createMeetRoomSnapshot } from './room';
import { roomService } from './room-service';

const now = '2026-11-25T00:00:00Z';
const guest = {
  accountId: 'guest',
  userId: 'guest',
  role: 'speaker',
  guest: true,
  scopes: ['meet:server'],
  limits: meetRoomLimitsSchema.parse({}),
} as MeetRealtimeTokenPayload;
const empty = createMeetRoomSnapshot();
const approved = {
  ...empty,
  approved: { guest: { userId: 'guest', displayName: 'Gus' } },
};
const present = {
  ...approved,
  presence: { guest: createMeetPresence(guest, now) },
};
const check = (state: typeof empty, token = guest) =>
  roomService(state, token, { action: 'board.access' });

describe('board access', () => {
  it('answers for a guest connected to the room', () => {
    expect(check(present)).toMatchObject({ body: { ok: true } });
    expect(check(present).status).toBeUndefined();
  });

  it('refuses an approved guest who is not connected', () => {
    expect(check(approved).status).toBe(403);
    // The programming read still admits a remembered approval.
    expect(
      roomService(approved, guest, { action: 'programming.read' }).status
    ).toBeUndefined();
  });

  it('refuses a guest still waiting in the lobby', () => {
    const waiting = {
      ...empty,
      waiting: {
        guest: {
          userId: 'guest',
          displayName: 'Gus',
          requestedAt: now,
        },
      },
    } as typeof empty;
    expect(check(waiting).status).toBe(403);
  });

  it('refuses everyone once the room has ended', () => {
    const host = { ...guest, role: 'host' } as MeetRealtimeTokenPayload;
    expect(check({ ...present, ended: true }).status).toBe(403);
    expect(check({ ...empty, ended: true }, host).status).toBe(403);
    expect(check(empty, host)).toMatchObject({ body: { ok: true } });
  });

  it('answers only signed server callers', () => {
    expect(check(present, { ...guest, scopes: [] }).status).toBe(403);
  });
});
