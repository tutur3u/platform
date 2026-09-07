import 'server-only';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
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
export async function getMeetCallAccess(
  meetingId: string,
  fallbackName: string
) {
  if (!z.uuid().safeParse(meetingId).success)
    throw new MeetCallAccessError(404, 'Meeting not found');
  const user = await getSatelliteAppSessionUser('meet');
  if (!user?.id) throw new MeetCallAccessError(401, 'Sign in to join');
  const db = await createAdminClient({ noCookie: true });
  const { data: meeting, error } = await db
    .from('workspace_meetings')
    .select('id, name, creator_id, ws_id, workspaces(personal)')
    .eq('id', meetingId)
    .maybeSingle();
  if (error) throw new MeetCallAccessError(500, 'Meeting lookup failed');
  if (!meeting?.creator_id)
    throw new MeetCallAccessError(404, 'Meeting not found');
  const membership = await verifyWorkspaceMembershipType({
    supabase: db,
    userId: user.id,
    wsId: meeting.ws_id,
    requiredType: 'ANY',
  });
  if (membership.error === 'membership_lookup_failed')
    throw new MeetCallAccessError(500, 'Membership lookup failed');
  const isHost = meeting.creator_id === user.id;
  if (isHost && (!membership.ok || membership.membershipType !== 'MEMBER'))
    throw new MeetCallAccessError(403, 'Workspace access denied');
  if (!membership.ok) {
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
  const { data: profile, error: profileError } = await Promise.resolve(
    db
      .from('users')
      .select('display_name, user_private_details(full_name)')
      .eq('id', user.id)
      .maybeSingle()
  ).catch(() => ({ data: null, error: { code: 'PROFILE_LOOKUP_REJECTED' } }));
  if (profileError)
    console.warn(
      'Meet participant profile lookup failed; using account identity',
      {
        code: profileError.code,
      }
    );
  const displayName = [
    profile?.display_name,
    profile?.user_private_details?.full_name,
    user.user_metadata?.display_name,
    user.user_metadata?.full_name,
  ].find(
    (value): value is string => typeof value === 'string' && !!value.trim()
  );
  return {
    user,
    meeting,
    isHost,
    displayName: (displayName || user.email || fallbackName)
      .trim()
      .slice(0, 120),
    needsDisplayName: !displayName && !profileError,
    admission: membership.ok ? ('open' as const) : ('lobby' as const),
    canReadWorkspace: membership.ok && membership.membershipType === 'MEMBER',
    workspaceSlug: toWorkspaceSlug(meeting.ws_id, {
      personal: !!meeting.workspaces?.personal,
    }),
  };
}
