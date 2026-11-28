import { resolveMeetRealtimeUrl } from '@tuturuuu/realtime/meet';
import 'server-only';

import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import {
  getMeetRealtimeScopesForRole,
  meetAccountDeviceId,
  type MeetRealtimeAdmission,
  type MeetRealtimeRole,
  meetRealtimeTokenPayloadSchema,
  meetStreamEntitlement,
  type MeetStreamTier,
} from '@tuturuuu/realtime/meet';
import { MEET_CLASSROOM_TOOLS_SCOPE } from '@tuturuuu/realtime/meet/classroom-tools-schema';
import { signMeetRealtimeToken } from '@tuturuuu/realtime/meet/token';

export { getMeetRealtimeTokenSecret } from './realtime-token-secret';
import { getMeetRealtimeTokenSecret } from './realtime-token-secret';

const TOKEN_TTL_MS = 10 * 60_000;

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
  readRoomState = false,
  classroomTools = false,
  maxRoomDurationSeconds = 7200,
  workspaceMember = false,
  avatarUrl,
  admission = 'open',
  guest = false,
  guestTurnstileVerified,
  guestEventProof,
  eventHost,
  coHost = false,
  participantKind,
  isHost,
  meetingId,
  streamTier = 'free',
  userId,
  wsId,
}: {
  displayName: string;
  deviceId?: string;
  service?: boolean;
  /** Internal GET /room-state only. Admission and settings writes resolve capacity. */
  readRoomState?: boolean;
  classroomTools?: boolean;
  maxRoomDurationSeconds?: number;
  workspaceMember?: boolean;
  avatarUrl?: string;
  admission?: MeetRealtimeAdmission;
  /** Anonymous guests always wait in the lobby and never host. */
  guest?: boolean;
  guestTurnstileVerified?: true;
  guestEventProof?: number;
  eventHost?: true;
  /** Workspace admins who are not the meeting creator. */
  coHost?: boolean;
  participantKind?: 'member' | 'guest';
  isHost: boolean;
  meetingId: string;
  /** From the participant's own plan; guests and unknown plans get free. */
  streamTier?: MeetStreamTier;
  userId: string;
  wsId: string;
}) {
  const capacity =
    service || readRoomState
      ? {}
      : await (
          await import('./classroom-policy')
        ).getMeetRoomCapacityLimits(meetingId, wsId);
  // A member's connection id never equals the account id, which the call
  // socket would show to guests. Without a device id it is the account's keyed
  // room id, so reconnects and service calls keep one identity. A guest id is
  // already a per-meeting pseudonym, not a platform account.
  const deviceUserId = deviceId
    ? await meetDeviceIdentity(userId, deviceId)
    : guest
      ? userId
      : await meetAccountDeviceId(
          getMeetRealtimeTokenSecret(),
          `${wsId}:${meetingId}`,
          userId
        );
  const role: MeetRealtimeRole = isHost && !guest ? 'host' : 'speaker';
  const payload = meetRealtimeTokenPayloadSchema.parse({
    admission: role === 'host' ? 'open' : guest ? 'lobby' : admission,
    ...(guest ? { guest: true, guestTurnstileVerified, guestEventProof } : {}),
    ...(role === 'host' && eventHost ? { eventHost } : {}),
    ...(participantKind ? { participantKind } : {}),
    avatarUrl,
    displayName,
    exp: Math.floor((Date.now() + TOKEN_TTL_MS) / 1000),
    limits: {
      maxRoomDurationSeconds,
      ...capacity,
      stream: meetStreamEntitlement(guest ? 'free' : streamTier),
      video: {
        defaultCameraEnabled: false,
        maxFrameRate: 24,
        maxHeight: 720,
        maxWidth: 1280,
      },
    },
    meetingId,
    meetingApp: MEETING_APP,
    mode: 'call',
    role,
    roomId: `${wsId}:${meetingId}`,
    scopes: [
      ...getMeetRealtimeScopesForRole(role),
      ...(coHost && role !== 'host' ? ['class:cohost'] : []),
      ...(service && classroomTools ? [MEET_CLASSROOM_TOOLS_SCOPE] : []),
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
    token: signMeetRealtimeToken(payload, getMeetRealtimeTokenSecret()),
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
