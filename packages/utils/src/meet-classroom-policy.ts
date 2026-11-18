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
export function classroomParticipantCap(tier: string) {
  return tier === 'ENTERPRISE'
    ? 100
    : tier === 'PLUS' || tier === 'PRO'
      ? 50
      : 10;
}

async function resolveHostTier(
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
  if (strict && classroomParticipantCap(tier) === 10) {
    const identity = await db.auth.admin.getUserById(hostId);
    if (identity.error) throw new Error('Host unavailable');
    if (
      identity.data.user?.id !== hostId ||
      !isVerifiedTuturuuuStaffSession(identity.data.user)
    )
      throw new MeetClassroomPolicyError(
        403,
        'Free meetings require a verified @tuturuuu.com host'
      );
  }
  return tier;
}

function strictCapacityError(error: unknown): never {
  if (error instanceof MeetClassroomPolicyError) throw error;
  throw new MeetClassroomPolicyError(
    503,
    'Meeting capacity entitlement unavailable'
  );
}

/** Resolve the creator from the stored meeting, never from a caller's host claim. */
export async function getClassroomParticipantCap(
  meetingId: string,
  wsId: string
) {
  if (process.env.MEET_CLASSROOM_LIMITS_ENABLED !== 'true') return undefined;
  try {
    return classroomParticipantCap(
      await resolveHostTier(meetingId, wsId, true)
    );
  } catch (error) {
    strictCapacityError(error);
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
    const cap = classroomParticipantCap(
      await resolveHostTier(meetingId, wsId, strict)
    );
    if (!strict && cap === 10) return defaults;
    return {
      maxParticipants: strict ? cap : undefined,
      maxPublishers: cap,
      maxViewers: webinar ? 250 : cap,
    };
  } catch (error) {
    if (strict) strictCapacityError(error);
    console.warn('Meet room capacity entitlement unavailable');
    return defaults;
  }
}
