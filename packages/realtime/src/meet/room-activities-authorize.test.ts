import { describe, expect, it } from 'vitest';
import type { MeetRealtimeTokenPayload } from './primitives';
import { createMeetRoomSnapshot } from './room';
import { roomService } from './room-service';

const WS = '11111111-1111-4111-8111-111111111111';
const MEETING = '22222222-2222-4222-8222-222222222222';
const HOST = '33333333-3333-4333-8333-333333333333';
const COHOST = '44444444-4444-4444-8444-444444444444';
const MEMBER = '55555555-5555-4555-8555-555555555555';

function makeToken(
  overrides: Partial<MeetRealtimeTokenPayload> = {}
): MeetRealtimeTokenPayload {
  return {
    sub: HOST,
    userId: HOST,
    accountId: HOST,
    wsId: WS,
    meetingId: MEETING,
    roomId: `${WS}:${MEETING}`,
    displayName: 'Host',
    role: 'host',
    mode: 'call',
    scopes: ['meet:server', 'meet:workspace-member'],
    iat: 1,
    exp: 9_999_999_999,
    ...overrides,
  };
}

function makeRoom(opts?: {
  ended?: boolean;
  presentIds?: string[];
  approvedIds?: string[];
}) {
  const base = createMeetRoomSnapshot(`${WS}:${MEETING}`);
  const presence: typeof base.presence = {};
  for (const id of opts?.presentIds ?? []) {
    presence[id] = {
      userId: id,
      accountId: id,
      displayName: 'User',
      role: 'speaker',
      joinedAt: '2026-11-27T00:00:00.000Z',
      lastSeenAt: '2026-11-27T00:00:00.000Z',
      media: {
        audioEnabled: false,
        videoEnabled: false,
        screenEnabled: false,
      },
    };
  }
  const approved: Record<string, true> = {};
  for (const id of opts?.approvedIds ?? []) approved[id] = true;
  return {
    ...base,
    ended: opts?.ended ?? false,
    presence,
    approved,
  };
}

describe('roomService activities.authorize', () => {
  it('allows a present host and returns admitted: true', () => {
    const res = roomService(
      makeRoom({ presentIds: [HOST] }),
      makeToken(),
      { action: 'activities.authorize' }
    );
    expect(res.status).toBeUndefined();
    expect(res.body).toEqual({ ok: true, admitted: true });
  });

  it('allows an approved workspace co-host', () => {
    const res = roomService(
      makeRoom({ approvedIds: [COHOST] }),
      makeToken({
        sub: COHOST,
        userId: COHOST,
        accountId: COHOST,
        role: 'speaker',
        scopes: ['meet:server', 'meet:workspace-member', 'class:cohost'],
      }),
      { action: 'activities.authorize' }
    );
    expect(res.status).toBeUndefined();
    expect(res.body).toEqual({ ok: true, admitted: true });
  });

  it('returns 409 when the meeting has ended', () => {
    const res = roomService(
      makeRoom({ ended: true, presentIds: [HOST] }),
      makeToken(),
      { action: 'activities.authorize' }
    );
    expect(res.status).toBe(409);
  });

  it('returns 403 when caller is neither present nor approved', () => {
    const res = roomService(makeRoom(), makeToken(), {
      action: 'activities.authorize',
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 for a present member who cannot run activities', () => {
    const res = roomService(
      makeRoom({ presentIds: [MEMBER] }),
      makeToken({
        sub: MEMBER,
        userId: MEMBER,
        accountId: MEMBER,
        role: 'speaker',
        scopes: ['meet:server', 'meet:workspace-member'],
      }),
      { action: 'activities.authorize' }
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 for a guest token', () => {
    const res = roomService(
      makeRoom({ presentIds: [MEMBER] }),
      makeToken({
        sub: MEMBER,
        userId: MEMBER,
        accountId: MEMBER,
        role: 'speaker',
        guest: true,
        scopes: ['meet:server'],
      }),
      { action: 'activities.authorize' }
    );
    expect(res.status).toBe(403);
  });
});
