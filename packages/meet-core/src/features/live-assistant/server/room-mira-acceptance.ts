import 'server-only';
import {
  MIRA_ROOM_NOTICE_VERSION,
  type MiraRoomCapability,
  type MiraRoomView,
} from '@tuturuuu/realtime/meet';
import { MeetCallAccessError } from '../../call/lib/call-access';
import { resolveMeetClassRole } from '../../call/server/class-role';
import {
  callRoomService,
  type MeetCallRouteAccess,
} from '../../call/server/room-service';
import { readRoomMiraAvailability } from './room-mira-authority';
import { endMiraAcceptance, recordMiraAcceptance } from './room-mira-evidence';

const isGuest = (access: MeetCallRouteAccess) =>
  'guest' in access && access.guest === true;

async function roomOptions(access: MeetCallRouteAccess) {
  if (isGuest(access)) return {};
  const { coHost } = await resolveMeetClassRole(access, { required: true });
  return coHost ? { coHost: true } : {};
}

type AcceptResult = {
  revision: number;
  acceptorName: string;
  replacedRevision: number | null;
};

/**
 * Turns room Mira on for the meeting. The workspace must hold its 18+
 * declaration (checked with the deployment, gate and provider), the caller
 * confirms the audience is 18 or older, and the room confirms the caller is
 * the host or a co-host who is present. The revision is allocated durably
 * first so it stays monotonic across room restores; a revision the room
 * then refuses is ended as not applied.
 */
export async function acceptRoomMira(
  access: MeetCallRouteAccess,
  capabilities: MiraRoomCapability[]
) {
  if (isGuest(access))
    throw new MeetCallAccessError(403, 'Guests cannot turn on Mira');
  if (!(await readRoomMiraAvailability(access)))
    throw new MeetCallAccessError(
      403,
      'Room Mira needs the workspace 18+ setting',
      'MIRA_WORKSPACE_UNAVAILABLE'
    );
  const options = await roomOptions(access);
  const view = await callRoomService<MiraRoomView>(
    access,
    { action: 'mira.room.read' },
    options
  );
  if (!view.canAccept)
    throw new MeetCallAccessError(
      403,
      'Only the host or a co-host in the meeting can turn on Mira'
    );
  const revision = await recordMiraAcceptance({
    meetingId: access.meeting.id,
    userId: access.user.id,
    noticeVersion: MIRA_ROOM_NOTICE_VERSION,
    capabilities,
  });
  let result: AcceptResult;
  try {
    result = await callRoomService<AcceptResult>(
      access,
      {
        action: 'mira.room.accept',
        revision,
        capabilities,
        noticeVersion: MIRA_ROOM_NOTICE_VERSION,
        audienceAdultConfirmed: true,
      },
      options
    );
  } catch (error) {
    await endMiraAcceptance({
      meetingId: access.meeting.id,
      revision,
      userId: access.user.id,
      reason: 'not_applied',
    }).catch(() => undefined);
    throw error;
  }
  if (result.replacedRevision)
    await endMiraAcceptance({
      meetingId: access.meeting.id,
      revision: result.replacedRevision,
      userId: access.user.id,
      reason: 'expanded',
    }).catch((error: unknown) =>
      console.error('Room Mira expansion evidence failed', {
        name: error instanceof Error ? error.name : 'unknown',
      })
    );
  return result;
}

/**
 * Ends the current acceptance. Turning Mira off needs the host or a
 * co-host; reporting a minor is open to every participant, guests included.
 */
export async function endRoomMira(
  access: MeetCallRouteAccess,
  reason: 'turned_off' | 'minor_reported'
) {
  const result = await callRoomService<{ endedRevision: number | null }>(
    access,
    { action: 'mira.room.end', reason },
    reason === 'turned_off' ? await roomOptions(access) : {}
  );
  // The room has already ended Mira; a failed evidence write is logged and
  // never reported as Mira still being on.
  if (result.endedRevision)
    await endMiraAcceptance({
      meetingId: access.meeting.id,
      revision: result.endedRevision,
      userId: isGuest(access) ? null : access.user.id,
      reason,
    }).catch((error: unknown) =>
      console.error('Room Mira end evidence failed', {
        name: error instanceof Error ? error.name : 'unknown',
      })
    );
  return result;
}
