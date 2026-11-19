import { describe, expect, it } from 'vitest';
import {
  MEET_GUEST_TTL_SECONDS,
  meetGuestCookieHeader,
  normalizeMeetGuestName,
  signMeetGuestSession,
  verifyMeetGuestSession,
} from './guest-session';

const secret = 'test-secret';
const meetingId = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
const guestId = '2d6c8a1e-4b5f-4c3d-9e8f-0a1b2c3d4e5f';
const now = 1_800_000_000;

async function cookie(
  overrides: Partial<Parameters<typeof signMeetGuestSession>[0]> = {}
) {
  return signMeetGuestSession(
    { guestId, meetingId, displayName: 'Hà My', exp: now + 600, ...overrides },
    secret
  );
}

describe('meet guest session', () => {
  it('round-trips a signed session for the same meeting', async () => {
    await expect(
      verifyMeetGuestSession(await cookie(), meetingId, secret, now)
    ).resolves.toEqual({
      guestId,
      meetingId,
      displayName: 'Hà My',
      exp: now + 600,
    });
  });

  it('refuses another meeting, another secret, tampering and expiry', async () => {
    const value = await cookie();
    const other = '0c9b1f6e-1111-4c3d-9e8f-0a1b2c3d4e5f';
    await expect(
      verifyMeetGuestSession(value, other, secret, now)
    ).resolves.toBeNull();
    await expect(
      verifyMeetGuestSession(value, meetingId, 'other', now)
    ).resolves.toBeNull();
    const [body, signature] = value.split('.');
    await expect(
      verifyMeetGuestSession(`${body}x.${signature}`, meetingId, secret, now)
    ).resolves.toBeNull();
    await expect(
      verifyMeetGuestSession(value, meetingId, secret, now + 601)
    ).resolves.toBeNull();
    await expect(
      verifyMeetGuestSession(undefined, meetingId, secret, now)
    ).resolves.toBeNull();
    await expect(
      verifyMeetGuestSession('a.b.c', meetingId, secret, now)
    ).resolves.toBeNull();
  });

  it('refuses an expiry beyond the guest lifetime and a non-uuid guest id', async () => {
    await expect(
      verifyMeetGuestSession(
        await cookie({ exp: now + MEET_GUEST_TTL_SECONDS + 60 }),
        meetingId,
        secret,
        now
      )
    ).resolves.toBeNull();
    await expect(
      verifyMeetGuestSession(
        await cookie({ guestId: 'not-a-uuid' }),
        meetingId,
        secret,
        now
      )
    ).resolves.toBeNull();
  });

  it('normalizes display names and strips control characters', () => {
    expect(normalizeMeetGuestName('  An ‮ Nguyen\n ')).toBe('An Nguyen');
    expect(normalizeMeetGuestName('x'.repeat(200))).toHaveLength(60);
    expect(normalizeMeetGuestName(42)).toBe('');
    expect(normalizeMeetGuestName('   ')).toBe('');
  });

  it('builds an HttpOnly, Secure, host-only cookie', () => {
    const header = meetGuestCookieHeader('value', 60);
    expect(header).toContain('__Host-meet-guest=value');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(header).toContain('Path=/');
    expect(header).not.toContain('Domain');
    expect(meetGuestCookieHeader('', 0)).toContain('Max-Age=0');
  });
});
