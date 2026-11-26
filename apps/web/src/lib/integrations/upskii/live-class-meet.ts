import 'server-only';
import {
  MEET_EXTERNAL_CLASS_SCOPE,
  meetRealtimeTokenPayloadSchema,
  resolveMeetRealtimeUrl,
} from '@tuturuuu/realtime/meet';
import { signMeetRealtimeToken } from '@tuturuuu/realtime/meet/token';
import { getMeetRealtimeTokenSecret } from '@tuturuuu/meet-core/features/call/lib/call-session';
import { z } from 'zod';

type RoomIdentity = { meetingId: string; userId: string; wsId: string };

async function roomCommand(
  { meetingId, userId, wsId }: RoomIdentity,
  action: 'external-class.initialize' | 'external-class.status'
) {
  const endpoint = new URL(
    resolveMeetRealtimeUrl(
      process.env.NEXT_PUBLIC_MEET_REALTIME_URL ||
        process.env.MEET_REALTIME_URL,
      process.env.NODE_ENV === 'development'
    )
  );
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
  endpoint.pathname = '/room-service';
  endpoint.search = '';
  const token = signMeetRealtimeToken(
    meetRealtimeTokenPayloadSchema.parse({
      accountId: userId,
      admission: 'open',
      displayName: 'Host',
      exp: Math.floor(Date.now() / 1000) + 30,
      meetingApp: 'meet',
      meetingId,
      mode: 'call',
      role: 'host',
      roomId: `${wsId}:${meetingId}`,
      scopes: ['meet:server', MEET_EXTERNAL_CLASS_SCOPE],
      userId,
      wsId,
    }),
    getMeetRealtimeTokenSecret()
  );
  const response = await fetch(endpoint, {
    body: JSON.stringify({ action }),
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Meet room service unavailable');
  return response.json();
}

export async function initializeLiveClassRoom(room: RoomIdentity) {
  return z
    .object({ ready: z.boolean() })
    .parse(await roomCommand(room, 'external-class.initialize')).ready;
}

export async function isLiveClassRoomOpen(room: RoomIdentity) {
  return z
    .object({ live: z.boolean() })
    .parse(await roomCommand(room, 'external-class.status')).live;
}
