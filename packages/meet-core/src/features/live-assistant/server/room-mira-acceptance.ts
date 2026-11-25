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
import {
  requireMiraAccountConfirmation,
  usesMiraAccountConfirmation,
} from './account-confirmation';
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
  accountConfirmationRequired?: true;
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
  const accountFlow = usesMiraAccountConfirmation();
  if (accountFlow) await requireMiraAccountConfirmation(access);
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
  // Mira stays off without its durable acceptance record; the caller can
  // retry, so the failure is reported as temporarily unavailable.
  const revision = await recordMiraAcceptance({
    meetingId: access.meeting.id,
    userId: access.user.id,
    noticeVersion: MIRA_ROOM_NOTICE_VERSION,
    capabilities,
  }).catch((error: unknown) => {
    console.error('Room Mira acceptance evidence failed', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    throw new MeetCallAccessError(
      503,
      'Mira could not be turned on right now',
      'MIRA_EVIDENCE_UNAVAILABLE'
    );
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
        ...(accountFlow ? { accountConfirmationRequired: true } : {}),
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
  if (accountFlow && result.accountConfirmationRequired !== true) {
    // Older Workers ignore the marker. End that live acceptance and reconcile
    // its evidence before telling the host to retry on a compatible Worker.
    await endRoomMiraWithOptions(access, 'turned_off', options, revision).catch(
      (error: unknown) =>
        console.error('Room Mira incompatible acceptance could not end', {
          name: error instanceof Error ? error.name : 'unknown',
        })
    );
    throw new MeetCallAccessError(
      503,
      'Realtime must be updated before turning on Mira',
      'realtime_outdated'
    );
  }
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
  return endRoomMiraWithOptions(
    access,
    reason,
    reason === 'turned_off' ? await roomOptions(access) : {}
  );
}

async function endRoomMiraWithOptions(
  access: MeetCallRouteAccess,
  reason: 'turned_off' | 'minor_reported',
  options: Awaited<ReturnType<typeof roomOptions>>,
  expectedRevision?: number
) {
  const result = await callRoomService<{ endedRevision: number | null }>(
    access,
    {
      action: 'mira.room.end',
      reason,
      ...(expectedRevision ? { expectedRevision } : {}),
    },
    options
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
