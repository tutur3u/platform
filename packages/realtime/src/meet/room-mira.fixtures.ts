import { meetRealtimeTokenPayloadSchema } from './primitives';
import { applyMiraRoomConsent } from './room-mira-consent';
import { MIRA_ROOM_NOTICE_VERSION } from './room-mira-acceptance';
import type { RoomServiceState } from './room-service';

export const miraMeetingId = '00000000-0000-4000-8000-000000000002';

export const miraToken = (
  id: string,
  role: 'host' | 'speaker' | 'viewer' = 'speaker',
  extra: Record<string, unknown> = {}
) =>
  meetRealtimeTokenPayloadSchema.parse({
    exp: 2000000000,
    limits: {},
    meetingId: miraMeetingId,
    mode: 'call',
    role,
    roomId: 'room',
    scopes: ['meet:server'],
    userId: id,
    accountId: id,
    wsId: '00000000-0000-4000-8000-000000000003',
    ...extra,
  });

export const acceptanceRevisionOf = (state: RoomServiceState) =>
  state.miraRoom?.acceptance?.revision ?? 0;

/** A present host accepts room Mira with chat at the given revision. */
export function acceptMira(
  state: RoomServiceState,
  hostId: string,
  revision = (state.miraRoom?.lastRevision ?? 0) + 1,
  now?: number,
  capabilities: string[] = ['chat']
) {
  const result = applyMiraRoomConsent(
    state,
    miraToken(hostId, 'host'),
    {
      action: 'mira.room.accept',
      revision,
      capabilities,
      noticeVersion: MIRA_ROOM_NOTICE_VERSION,
      audienceAdultConfirmed: true,
    },
    now
  );
  if (!result || (result.status ?? 200) >= 400)
    throw new Error(`accept failed: ${JSON.stringify(result?.body)}`);
  return result.state;
}

export function endMira(
  state: RoomServiceState,
  id: string,
  reason: 'turned_off' | 'minor_reported',
  role: 'host' | 'speaker' = 'host',
  now?: number
) {
  return applyMiraRoomConsent(
    state,
    miraToken(id, role),
    { action: 'mira.room.end', reason },
    now
  )!;
}

/** The choice command as the client sends it from an in-call confirm. */
export const miraChoice = (state: RoomServiceState, choice: 'on' | 'off') => ({
  action: 'mira.room.choice',
  choice,
  version: MIRA_ROOM_NOTICE_VERSION,
  acceptanceRevision: acceptanceRevisionOf(state),
  source: 'confirm' as const,
});
