import 'server-only';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
export class MeetClassroomPolicyError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export const MEET_CLASSROOM_LIMITS_ENV = 'MEET_CLASSROOM_LIMITS_ENABLED';
/** Hard cap for meetings hosted by a verified @tuturuuu.com staff account. */
export const STAFF_CLASSROOM_PARTICIPANT_CAP = 100;

export function classroomParticipantCap(tier: string) {
  return tier === 'ENTERPRISE'
    ? 100
    : tier === 'PLUS' || tier === 'PRO'
      ? 50
      : 10;
}

async function resolveHostCap(
  meetingId: string,
  wsId: string,
  strict: boolean
) {
  const { createAdminClient } = await import('@tuturuuu/supabase/next/server');
  const { getHostMeetingTier } = await import('@tuturuuu/utils/meet-duration');
  const db = await createAdminClient({ noCookie: true });
  const meeting = await db
    .from('workspace_meetings')
    .select('creator_id')
    .eq('id', meetingId)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (meeting.error || !meeting.data?.creator_id)
    throw new Error('Meeting unavailable');
  const hostId = meeting.data.creator_id;
  const tier = await getHostMeetingTier(hostId);
  const tierCap = classroomParticipantCap(tier);
  if (!strict) return tierCap;
  const identity = await db.auth.admin.getUserById(hostId);
  if (identity.error) throw new Error('Host unavailable');
  const staff =
    identity.data.user?.id === hostId &&
    isVerifiedTuturuuuStaffSession(identity.data.user);
  if (staff) return STAFF_CLASSROOM_PARTICIPANT_CAP;
  if (tierCap === 10)
    throw new MeetClassroomPolicyError(
      403,
      'Free meetings require a verified @tuturuuu.com host'
    );
  return tierCap;
}

/**
 * Resolve the creator from the stored meeting, never from a caller's host claim.
 * A failed lookup leaves the room uncapped; only a policy refusal propagates.
 */
export async function getClassroomParticipantCap(
  meetingId: string,
  wsId: string
) {
  if (process.env.MEET_CLASSROOM_LIMITS_ENABLED !== 'true') return undefined;
  try {
    return await resolveHostCap(meetingId, wsId, true);
  } catch (error) {
    if (error instanceof MeetClassroomPolicyError) throw error;
    console.warn('Meet classroom capacity entitlement unavailable');
    return undefined;
  }
}

export async function getMeetRoomCapacityLimits({
  meetingId,
  wsId,
  mode,
  parley = false,
}: {
  meetingId: string;
  wsId: string;
  mode: 'call' | 'webinar' | 'stream';
  parley?: boolean;
}) {
  const webinar = mode === 'webinar';
  const defaults = {
    maxParticipants: undefined,
    maxPublishers: webinar ? 12 : 8,
    maxViewers: webinar ? 250 : 96,
  };
  if (parley) return defaults;
  const strict = process.env.MEET_CLASSROOM_LIMITS_ENABLED === 'true';
  try {
    const cap = await resolveHostCap(meetingId, wsId, strict);
    if (!strict && cap === 10) return defaults;
    return {
      maxParticipants: strict ? cap : undefined,
      maxPublishers: cap,
      maxViewers: webinar ? 250 : cap,
    };
  } catch (error) {
    if (error instanceof MeetClassroomPolicyError) throw error;
    console.warn('Meet room capacity entitlement unavailable');
    return defaults;
  }
}
