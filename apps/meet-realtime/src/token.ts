import type { MeetRealtimeTokenPayload } from '../../../packages/realtime/src/meet';
import { verifyMeetRealtimeToken } from '../../../packages/realtime/src/meet/token';

function getMeetRealtimeTokenSecret(
  secret = process.env.MEET_REALTIME_TOKEN_SECRET
) {
  const resolvedSecret =
    secret ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (resolvedSecret?.trim()) {
    return resolvedSecret.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Meet realtime token validation requires MEET_REALTIME_TOKEN_SECRET or the platform Supabase service secret in production'
    );
  }

  return 'meet-local-development-token-secret';
}

export function verifyMeetRealtimeJoinToken(
  token: string,
  secret?: string
): MeetRealtimeTokenPayload | null {
  return verifyMeetRealtimeToken(token, getMeetRealtimeTokenSecret(secret));
}
