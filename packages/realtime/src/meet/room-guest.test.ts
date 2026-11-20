import { describe, expect, it } from 'vitest';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import { createMeetPresence, createMeetRoomSnapshot } from './room';
import { admitOrHold, decideRoomAdmission } from './room-admission';
import { applyMeetRoomCommand } from './room-commands';
import { parseMeetRoomSettingsPatch } from './room-options';
import { recordRemovedGuest } from './room-removed-guests';

const base = {
  exp: 2_000_000_000,
  limits: {
    maxRoomDurationSeconds: 7200,
    video: {
      defaultCameraEnabled: false,
      maxFrameRate: 24,
      maxHeight: 720,
      maxWidth: 1280,
    },
  },
  meetingId: '7f2a528e-3bff-40ee-bfda-5b944ad03ed8',
  role: 'speaker',
  roomId: 'room',
  userId: '33333333-3333-4333-8333-333333333333',
  wsId: '22222222-2222-4222-8222-222222222222',
};

describe('anonymous meet guests', () => {
  it('carries the guest marker from the token into presence', () => {
    const token = meetRealtimeTokenPayloadSchema.parse({
      ...base,
      guest: true,
      admission: 'lobby',
    });
    expect(createMeetPresence(token, '2026-11-19T00:00:00.000Z')).toMatchObject(
      {
        guest: true,
        role: 'speaker',
      }
    );
  });

  it('keeps members unmarked and rejects a false guest marker', () => {
    const token = meetRealtimeTokenPayloadSchema.parse(base);
    expect(
      createMeetPresence(token, '2026-11-19T00:00:00.000Z')
    ).not.toHaveProperty('guest');
    expect(
      meetRealtimeTokenPayloadSchema.safeParse({ ...base, guest: false })
        .success
    ).toBe(false);
  });

  it('rejects a removed guest id until the ban expires', () => {
    const guestId = '33333333-3333-4333-8333-333333333333';
    const token = meetRealtimeTokenPayloadSchema.parse({
      ...base,
      guest: true,
      admission: 'lobby',
      userId: guestId,
      accountId: guestId,
    });
    const now = '2026-11-19T12:00:00.000Z';
    const state = recordRemovedGuest(
      createMeetRoomSnapshot(),
      guestId,
      Date.parse(now),
      true
    );
    expect(admitOrHold(state, token, now).reply[0]).toMatchObject({
      type: 'error',
      error: 'guest_removed',
    });
  });

  it('requires host approval for a fresh identity after a guest is removed', () => {
    const host = meetRealtimeTokenPayloadSchema.parse({
      ...base,
      role: 'host',
      userId: '11111111-1111-4111-8111-111111111111',
    });
    const guest = meetRealtimeTokenPayloadSchema.parse({
      ...base,
      guest: true,
      admission: 'lobby',
    });
    const now = '2026-11-19T12:00:00.000Z';
    const room = {
      ...createMeetRoomSnapshot(),
      settings: { shareNotes: false, skipLobby: true },
    };
    const hosted = admitOrHold(room, host, now).state;
    const waiting = admitOrHold(hosted, guest, now).state;
    expect(waiting.waiting[guest.userId]).toBeDefined();
    const admitted = decideRoomAdmission(
      waiting,
      { type: 'admission.decide', userId: guest.userId, admit: true },
      host,
      now
    ).state;
    expect(admitted.presence[guest.userId]?.guest).toBe(true);
    const removed = applyMeetRoomCommand(admitted, {
      token: host,
      now,
      message: { type: 'participant.remove', userId: guest.userId },
    }).state;
    expect(admitOrHold(removed, guest, now).reply[0]).toMatchObject({
      error: 'guest_removed',
    });
    const fresh = meetRealtimeTokenPayloadSchema.parse({
      ...guest,
      userId: '44444444-4444-4444-8444-444444444444',
    });
    const rejoined = admitOrHold(removed, fresh, now).state;
    expect(rejoined.presence[fresh.userId]).toBeUndefined();
    expect(rejoined.waiting[fresh.userId]).toBeDefined();
  });

  it('accepts the host guest-join setting and keeps it off by default', () => {
    const parsed = parseMeetRoomSettingsPatch({ allowAnonymousGuests: true });
    expect(parsed.success && parsed.data.allowAnonymousGuests).toBe(true);
    const empty = parseMeetRoomSettingsPatch({});
    expect(empty.success && empty.data.allowAnonymousGuests).toBeUndefined();
  });
});
