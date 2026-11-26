// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveMeetGuestRateLimitActor } from './guest-rate-limit-actor';
import { MEET_GUEST_COOKIE, signMeetGuestSession } from './guest-session';

const SECRET = 'guest-rate-limit-secret';
const MEETING = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const GUEST = '11111111-1111-4111-8111-111111111111';

const now = () => Math.floor(Date.now() / 1000);
const signed = (meetingId = MEETING, secret = SECRET, exp = now() + 3600) =>
  signMeetGuestSession(
    { guestId: GUEST, meetingId, displayName: 'Minh', exp },
    secret
  );
const request = (pathname: string, headers: Record<string, string> = {}) => ({
  headers: new Headers(headers),
  nextUrl: { pathname },
});
const POLLS = `/api/meet-call/${MEETING}/polls`;
const withCookie = (value: string, pathname = POLLS) =>
  resolveMeetGuestRateLimitActor(
    request(pathname, { cookie: `theme=dark; ${MEET_GUEST_COOKIE}=${value}` })
  );

describe('the Meet guest rate-limit actor', () => {
  beforeEach(() => vi.stubEnv('MEET_REALTIME_TOKEN_SECRET', SECRET));
  afterEach(() => vi.unstubAllEnvs());

  it('names the guest of a signed session for the meeting in the path', async () => {
    expect(await withCookie(await signed())).toEqual({
      scopeId: MEETING,
      guestId: GUEST,
    });
  });

  it('ignores a session signed for another meeting', async () => {
    expect(await withCookie(await signed(OTHER))).toBeNull();
    // A cookie for another meeting never names a guest here, on any route.
    const board = `/api/meet-call/${MEETING}/whiteboard`;
    expect(await withCookie(await signed(OTHER), board)).toBeNull();
  });

  it('ignores a forged, unsigned or expired session', async () => {
    const valid = await signed();
    const [body] = valid.split('.');
    expect(await withCookie(`${body}.forged-signature`)).toBeNull();
    expect(await withCookie(body!)).toBeNull();
    const foreign = await signed(MEETING, 'attacker-secret');
    expect(await withCookie(foreign)).toBeNull();
    const expired = await signed(MEETING, SECRET, now() - 1);
    expect(await withCookie(expired)).toBeNull();
  });

  it('never trusts client-supplied guest headers', async () => {
    expect(
      await resolveMeetGuestRateLimitActor(
        request(`/api/meet-call/${MEETING}/polls`, {
          'x-meet-guest-id': GUEST,
          'x-meet-display-name': 'Minh',
        })
      )
    ).toBeNull();
  });

  it('only applies to Meet call routes', async () => {
    expect(await withCookie(await signed(), '/api/v1/users/me')).toBeNull();
  });

  it('gives no guest when the production secret is missing', async () => {
    const value = await signed();
    vi.stubEnv('MEET_REALTIME_TOKEN_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(await withCookie(value)).toBeNull();
  });
});
