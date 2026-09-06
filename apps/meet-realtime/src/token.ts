import type { MeetRealtimeTokenPayload } from '../../../packages/realtime/src/meet';
import { verifyMeetRealtimeToken } from '../../../packages/realtime/src/meet/token';

function getMeetRealtimeTokenSecret(
  secret = process.env.MEET_REALTIME_TOKEN_SECRET
) {
  const resolvedSecret = secret;

  if (resolvedSecret?.trim()) {
    return resolvedSecret.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Meet realtime token validation requires MEET_REALTIME_TOKEN_SECRET in production'
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
