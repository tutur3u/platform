import {
  type MeetRealtimeRole,
  type MeetRealtimeRoomMode,
  meetRealtimeTokenPayloadSchema,
} from '@tuturuuu/realtime/meet';
import { signMeetRealtimeToken } from '@tuturuuu/realtime/meet/token';

const TOKEN_TTL_MS = 10 * 60_000;

function getMeetRealtimeTokenSecret() {
  const secret =
    process.env.MEET_REALTIME_TOKEN_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (secret?.trim()) {
    return secret.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Meet realtime token signing requires MEET_REALTIME_TOKEN_SECRET or the platform Supabase service secret in production'
    );
  }

  return 'meet-local-development-token-secret';
}

export function getMeetRealtimeUrl() {
  return (
    process.env.NEXT_PUBLIC_MEET_REALTIME_URL ||
    process.env.MEET_REALTIME_URL ||
    'wss://meet.tuturuuu.com/realtime'
  );
}

function getScopesForRole(role: MeetRealtimeRole) {
  if (role === 'host') {
    return [
      'presence',
      'chat:write',
      'stage:write',
      'stream:control',
      'sfu:join',
      'sfu:publish',
      'sfu:subscribe',
    ];
  }

  if (role === 'speaker') {
    return [
      'presence',
      'chat:write',
      'sfu:join',
      'sfu:publish',
      'sfu:subscribe',
    ];
  }

  return ['presence', 'chat:write', 'sfu:join', 'sfu:subscribe'];
}

export function signMeetJoinToken(input: {
  displayName?: string;
  meetingId: string;
  mode: MeetRealtimeRoomMode;
  role: MeetRealtimeRole;
  userId: string;
  wsId: string;
}) {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const payload = meetRealtimeTokenPayloadSchema.parse({
    displayName: input.displayName,
    exp: Math.floor(expiresAt.getTime() / 1000),
    limits: {
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
    mode: input.mode,
    role: input.role,
    roomId: `${input.wsId}:${input.meetingId}`,
    scopes: getScopesForRole(input.role),
    userId: input.userId,
    wsId: input.wsId,
  });

  return {
    expiresAt,
    payload,
    token: signMeetRealtimeToken(payload, getMeetRealtimeTokenSecret()),
  };
}
