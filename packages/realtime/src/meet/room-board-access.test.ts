import { describe, expect, it } from 'vitest';
import {
  type MeetRealtimeTokenPayload,
  meetRoomLimitsSchema,
} from './primitives';
import { createMeetPresence, createMeetRoomSnapshot } from './room';
import { applyRoomBoardAccess } from './room-board-access';
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

  it('refuses a guest whose connection dropped during the grace period', () => {
    // Presence outlives a dropped socket; only an open socket counts.
    const board = { action: 'board.access' };
    const access = (connected: ReadonlySet<string>) =>
      applyRoomBoardAccess(present, guest, board, connected);
    expect(access(new Set(['guest']))).toMatchObject({ body: { ok: true } });
    expect(access(new Set())?.status).toBe(403);
    expect(access(new Set(['someone-else']))?.status).toBe(403);
    const host = { ...guest, role: 'host' } as MeetRealtimeTokenPayload;
    expect(applyRoomBoardAccess(empty, host, board, new Set())).toMatchObject({
      body: { ok: true },
    });
  });

  it('refuses a browser token even with an open socket', () => {
    const browser = { ...guest, scopes: [] } as MeetRealtimeTokenPayload;
    expect(
      applyRoomBoardAccess(
        present,
        browser,
        { action: 'board.access' },
        new Set(['guest'])
      )?.status
    ).toBe(403);
  });

  it('ignores every other action', () => {
    expect(
      applyRoomBoardAccess(present, guest, { action: 'read' }, new Set())
    ).toBeNull();
  });
});
