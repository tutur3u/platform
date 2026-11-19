import { describe, expect, it } from 'vitest';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import { createMeetPresence } from './room';
import { parseMeetRoomSettingsPatch } from './room-options';

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

  it('accepts the host guest-join setting and keeps it off by default', () => {
    const parsed = parseMeetRoomSettingsPatch({ allowAnonymousGuests: true });
    expect(parsed.success && parsed.data.allowAnonymousGuests).toBe(true);
    const empty = parseMeetRoomSettingsPatch({});
    expect(empty.success && empty.data.allowAnonymousGuests).toBeUndefined();
  });
});
