import type { VerifiedGuestActor } from '@tuturuuu/utils/api-proxy-guest-budget';
import { getMeetRealtimeTokenSecret } from './realtime-token-secret';
import { MEET_GUEST_COOKIE, verifyMeetGuestSession } from './guest-session';

/** `/api/meet-call/<meetingId>/...`: the meeting a guest request targets. */
const MEET_CALL_PATH = /^\/api\/meet-call\/([0-9a-zA-Z-]{1,64})(?:\/|$)/u;

function cookieValue(header: string | null, name: string) {
  if (!header) return null;
  for (const entry of header.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() === name)
      return entry.slice(separator + 1).trim();
  }
  return null;
}

/**
 * The guest a Meet API request belongs to, for the proxy's guest rate-limit
 * budget. Only the server-signed guest cookie counts, and only for the
 * meeting in the request path: the signature, the meeting binding and the
 * expiry are checked exactly as the call routes check them. Anything else,
 * including a missing secret, resolves to no guest.
 */
export async function resolveMeetGuestRateLimitActor(req: {
  headers: Headers;
  nextUrl: { pathname: string };
}): Promise<VerifiedGuestActor | null> {
  const meetingId = MEET_CALL_PATH.exec(req.nextUrl.pathname)?.[1];
  if (!meetingId) return null;
  const cookie = cookieValue(req.headers.get('cookie'), MEET_GUEST_COOKIE);
  if (!cookie) return null;
  let secret: string;
  try {
    secret = getMeetRealtimeTokenSecret();
  } catch {
    return null;
  }
  const session = await verifyMeetGuestSession(cookie, meetingId, secret);
  return session ? { scopeId: meetingId, guestId: session.guestId } : null;
}
