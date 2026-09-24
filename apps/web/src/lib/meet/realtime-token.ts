import {
  getMeetRealtimeScopesForRole,
  type MeetRealtimeAdmission,
  type MeetRealtimeRole,
  type MeetRealtimeRoomMode,
  meetRealtimeTokenPayloadSchema,
  resolveMeetRealtimeUrl,
} from '@tuturuuu/realtime/meet';
import { signMeetRealtimeToken } from '@tuturuuu/realtime/meet/token';

const TOKEN_TTL_MS = 10 * 60_000;

function getMeetRealtimeTokenSecret() {
  const secret = process.env.MEET_REALTIME_TOKEN_SECRET;

  if (secret?.trim()) {
    return secret.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Meet realtime token signing requires MEET_REALTIME_TOKEN_SECRET in production'
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

export function signMeetJoinToken(input: {
  admission?: MeetRealtimeAdmission;
  accountId?: string;
  service?: boolean;
  maxRoomDurationSeconds?: number;
  displayName?: string;
  meetingId: string;
  mode: MeetRealtimeRoomMode;
  role: MeetRealtimeRole;
  userId: string;
  wsId: string;
}) {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const payload = meetRealtimeTokenPayloadSchema.parse({
    // Hosts never wait; everyone else defaults to the room's lobby policy.
    admission: input.role === 'host' ? 'open' : (input.admission ?? 'open'),
    displayName: input.displayName,
    exp: Math.floor(expiresAt.getTime() / 1000),
    limits: {
      maxRoomDurationSeconds: input.maxRoomDurationSeconds,
      maxPublishers: input.mode === 'webinar' ? 12 : 8,
      maxViewers: input.mode === 'webinar' ? 250 : 96,
      video: {
        defaultCameraEnabled: false,
        maxFrameRate: 24,
        maxHeight: 720,
        maxWidth: 1280,
      },
    },
    meetingId: input.meetingId,
    accountId: input.accountId,
    mode: input.mode,
    role: input.role,
    roomId: `${input.wsId}:${input.meetingId}`,
    scopes: [
      ...getMeetRealtimeScopesForRole(input.role),
      ...(input.service ? ['meet:server'] : []),
    ],
    userId: input.userId,
    wsId: input.wsId,
  });

  return {
    expiresAt,
    payload,
    token: signMeetRealtimeToken(payload, getMeetRealtimeTokenSecret()),
  };
}

/** Keep each device distinct while binding it to the authenticated account. */
export async function meetDeviceIdentity(accountId: string, deviceId: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${accountId}:${deviceId}`)
  );
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
