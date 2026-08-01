import 'server-only';

import {
  getMeetRealtimeScopesForRole,
  type MeetRealtimeRole,
  meetRealtimeTokenPayloadSchema,
} from '@tuturuuu/realtime/meet';
import { signMeetRealtimeToken } from '@tuturuuu/realtime/meet/token';

const TOKEN_TTL_MS = 10 * 60_000;

function getTokenSecret() {
  const secret =
    process.env.MEET_REALTIME_TOKEN_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (secret?.trim()) return secret.trim();

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Meet call tokens require MEET_REALTIME_TOKEN_SECRET in production'
    );
  }

  return 'meet-local-development-token-secret';
}

export function getMeetRealtimeUrl() {
  return (
    process.env.NEXT_PUBLIC_MEET_REALTIME_URL ||
    process.env.MEET_REALTIME_URL ||
    'ws://127.0.0.1:7816/realtime'
  );
}

/**
 * Mints the short-lived join token the browser hands to the realtime server.
 *
 * The Cloudflare app secret never leaves the server: the browser only ever gets
 * this HMAC token, and the realtime server performs SFU calls on its behalf.
 */
export async function getMeetCallSession({
  displayName,
  isHost,
  meetingId,
  userId,
  wsId,
}: {
  displayName: string;
  isHost: boolean;
  meetingId: string;
  userId: string;
  wsId: string;
}) {
  const role: MeetRealtimeRole = isHost ? 'host' : 'speaker';
  const payload = meetRealtimeTokenPayloadSchema.parse({
    // Members of the workspace are already trusted, so only the host skips the
    // lobby today; guest links will flip this to 'lobby'.
    admission: 'open',
    displayName,
    exp: Math.floor((Date.now() + TOKEN_TTL_MS) / 1000),
    limits: {
      maxPublishers: 8,
      maxViewers: 96,
      video: {
        defaultCameraEnabled: false,
        maxFrameRate: 24,
        maxHeight: 720,
        maxWidth: 1280,
      },
    },
    meetingId,
    mode: 'call',
    role,
    roomId: `${wsId}:${meetingId}`,
    scopes: getMeetRealtimeScopesForRole(role),
    userId,
    wsId,
  });

  return {
    displayName,
    realtimeUrl: getMeetRealtimeUrl(),
    role,
    token: signMeetRealtimeToken(payload, getTokenSecret()),
  };
}
