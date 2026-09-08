import { resolveMeetRealtimeUrl } from '@tuturuuu/realtime/meet';
import 'server-only';

import {
  getMeetRealtimeScopesForRole,
  type MeetRealtimeAdmission,
  type MeetRealtimeRole,
  meetRealtimeTokenPayloadSchema,
} from '@tuturuuu/realtime/meet';
import { signMeetRealtimeToken } from '@tuturuuu/realtime/meet/token';

const TOKEN_TTL_MS = 10 * 60_000;

function getTokenSecret() {
  const secret = process.env.MEET_REALTIME_TOKEN_SECRET;

  if (secret?.trim()) return secret.trim();

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Meet call tokens require MEET_REALTIME_TOKEN_SECRET in production'
    );
  }

  return 'meet-local-development-token-secret';
}

export function getMeetRealtimeUrl() {
  return resolveMeetRealtimeUrl(
    process.env.NEXT_PUBLIC_MEET_REALTIME_URL || process.env.MEET_REALTIME_URL,
    process.env.NODE_ENV === 'development'
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
  deviceId,
  service = false,
  workspaceMember = false,
  avatarUrl,
  admission = 'open',
  isHost,
  meetingId,
  userId,
  wsId,
}: {
  displayName: string;
  deviceId?: string;
  service?: boolean;
  workspaceMember?: boolean;
  avatarUrl?: string;
  admission?: MeetRealtimeAdmission;
  isHost: boolean;
  meetingId: string;
  userId: string;
  wsId: string;
}) {
  const deviceUserId = deviceId
    ? await meetDeviceIdentity(userId, deviceId)
    : userId;
  const role: MeetRealtimeRole = isHost ? 'host' : 'speaker';
  const payload = meetRealtimeTokenPayloadSchema.parse({
    admission: isHost ? 'open' : admission,
    avatarUrl,
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
    scopes: [
      ...getMeetRealtimeScopesForRole(role),
      ...(service
        ? ['meet:server', ...(workspaceMember ? ['meet:workspace-member'] : [])]
        : []),
    ],
    userId: deviceUserId,
    accountId: userId,
    wsId,
  });

  return {
    displayName,
    realtimeUrl: getMeetRealtimeUrl(),
    role,
    token: signMeetRealtimeToken(payload, getTokenSecret()),
  };
}

/** Account-bound identity prevents a client-chosen device ID impersonating another participant. */
export async function meetDeviceIdentity(accountId: string, deviceId: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${accountId}:${deviceId}`)
  );
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    ''
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
