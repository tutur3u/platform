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

/** Resolve the creator from the stored meeting, never from a caller's host claim. */
export async function getClassroomParticipantCap(
  meetingId: string,
  wsId: string
) {
  if (process.env.MEET_CLASSROOM_LIMITS_ENABLED !== 'true') return undefined;
  try {
    const { createAdminClient } =
      await import('@tuturuuu/supabase/next/server');
    const { getHostMeetingTier } =
      await import('@tuturuuu/utils/meet-duration');
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
    if (!['PLUS', 'PRO', 'ENTERPRISE'].includes(tier)) {
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
    return classroomParticipantCap(tier);
  } catch (error) {
    if (error instanceof MeetClassroomPolicyError) throw error;
    throw new MeetClassroomPolicyError(
      503,
      'Meeting capacity entitlement unavailable'
    );
  }
}
