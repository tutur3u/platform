import 'server-only';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { canCreateOnlineMeeting } from '@tuturuuu/utils/meet-creation-policy';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';

export class MeetCallAccessError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/** Invite possession permits this call only, never workspace or archive access. */
export async function getMeetCallAccess(meetingId: string) {
  if (!z.uuid().safeParse(meetingId).success)
    throw new MeetCallAccessError(404, 'Meeting not found');
  const user = await getSatelliteAppSessionUser('meet');
  if (!user?.id) throw new MeetCallAccessError(401, 'Sign in to join');
  const db = await createAdminClient({ noCookie: true });
  const { data: meeting, error } = await db
    .from('workspace_meetings')
    .select('id, name, creator_id, ws_id')
    .eq('id', meetingId)
    .maybeSingle();
  if (error) throw new MeetCallAccessError(500, 'Meeting lookup failed');
  if (!meeting?.creator_id)
    throw new MeetCallAccessError(404, 'Meeting not found');
  const membership = await verifyWorkspaceMembershipType({
    supabase: db,
    userId: user.id,
    wsId: meeting.ws_id,
  });
  if (membership.error === 'membership_lookup_failed')
    throw new MeetCallAccessError(500, 'Membership lookup failed');
  const isHost = meeting.creator_id === user.id;
  if (!membership.ok) {
    // A removed creator must not regain host access through the guest path.
    if (isHost) throw new MeetCallAccessError(403, 'Workspace access denied');
    const { data: identity, error: identityError } =
      await db.auth.admin.getUserById(meeting.creator_id);
    if (identityError)
      throw new MeetCallAccessError(500, 'Meeting host lookup failed');
    if (
      !identity.user?.email_confirmed_at ||
      !canCreateOnlineMeeting(identity.user.email)
    )
      throw new MeetCallAccessError(403, 'Guest access is unavailable');
  }
  return { user, meeting, isHost, canReadWorkspace: membership.ok };
}
