import { meetRealtimeTokenPayloadSchema } from '../../../../packages/realtime/src/meet/primitives';
import { signMeetRealtimeToken } from '../../../../packages/realtime/src/meet/token';
import type { LiveSessionClaims } from '../../src/features/live-assistant/contracts';
import type { LiveEnvironment } from './storage';

export type LiveRoomIdentity = {
  workspaceId: string;
  isHost: boolean;
  displayName: string;
};
export async function liveRoomCommand<T>(
  env: LiveEnvironment,
  claims: LiveSessionClaims,
  identity: LiveRoomIdentity,
  command: unknown
): Promise<T> {
  const token = signMeetRealtimeToken(
    meetRealtimeTokenPayloadSchema.parse({
      admission: 'open',
      displayName: identity.displayName,
      exp: Math.floor(Date.now() / 1000) + 60,
      limits: {},
      meetingId: claims.meetingId,
      mode: 'call',
      role: identity.isHost ? 'host' : 'speaker',
      roomId: `${identity.workspaceId}:${claims.meetingId}`,
      scopes: ['meet:server', 'meet:live-server'],
      userId: claims.ownerId,
      accountId: claims.ownerId,
      wsId: identity.workspaceId,
    }),
    env.MEET_REALTIME_TOKEN_SECRET
  );
  const url = new URL(env.MEET_REALTIME_URL);
  url.protocol =
    url.protocol === 'ws:' || url.protocol === 'http:' ? 'http:' : 'https:';
  url.pathname = '/room-service';
  url.search = '';
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`live_room_${response.status}`);
  return (await response.json()) as T;
}
