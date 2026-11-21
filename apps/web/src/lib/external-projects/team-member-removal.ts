import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { ExternalProjectTeamAccess } from './team-access';

export const WORKSPACE_CREATOR_PROTECTED = 'WORKSPACE_CREATOR_PROTECTED';

/**
 * Postgres reads a uuid written without hyphens, with other hyphen groupings
 * or in braces as the same value. Only the canonical 8-4-4-4-12 spelling is
 * accepted here, so the id compared with the creator is the id the delete
 * matches.
 */
const memberIdSchema = z.guid();

const sameId = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();

/**
 * Removes a joined member (`?id=`) and/or cancels an invitation (`?email=`).
 *
 * The workspace creator is never removed here. The creator can always manage
 * the workspace, so refusing this keeps at least one person who can manage
 * members in every workspace whose creator is a member. The check reads the
 * creator and then deletes, so it does not cover a creator hand-over that
 * lands between the two, or a workspace whose recorded creator is not a
 * member.
 */
export async function removeExternalProjectTeamMember({
  access,
  request,
}: {
  access: ExternalProjectTeamAccess;
  request: Request;
}) {
  const searchParams = new URL(request.url).searchParams;
  const userId = searchParams.get('id')?.trim() || null;
  const userEmail = searchParams.get('email')?.trim() || null;

  if (!userId && !userEmail) {
    return NextResponse.json(
      { message: 'Missing member identifier' },
      { status: 400 }
    );
  }

  if (userId && !memberIdSchema.safeParse(userId).success) {
    return NextResponse.json(
      { message: 'Invalid member identifier' },
      { status: 400 }
    );
  }

  if (userId) {
    const { data: workspace, error } = await access.admin
      .from('workspaces')
      .select('creator_id')
      .eq('id', access.normalizedWorkspaceId)
      .maybeSingle();

    // Without the creator on record the protection cannot be applied, so
    // nothing is removed.
    if (error || !workspace?.creator_id) {
      console.error('Error resolving CMS team workspace creator', {
        error,
        wsId: access.normalizedWorkspaceId,
      });
      return NextResponse.json(
        { message: 'Error removing team member' },
        { status: 500 }
      );
    }

    if (sameId(workspace.creator_id, userId)) {
      return NextResponse.json(
        {
          code: WORKSPACE_CREATOR_PROTECTED,
          message: 'The workspace creator cannot be removed',
        },
        { status: 403 }
      );
    }
  }

  let inviteUserIds: string[] = [];

  if (userEmail) {
    const { data, error } = await access.admin
      .from('workspace_members_and_invites')
      .select('id')
      .eq('ws_id', access.normalizedWorkspaceId)
      .eq('email', userEmail);

    if (error) {
      console.error('Error resolving CMS team invite identities', {
        error,
        wsId: access.normalizedWorkspaceId,
      });
      return NextResponse.json(
        { message: 'Error removing team member' },
        { status: 500 }
      );
    }

    inviteUserIds = (data ?? [])
      .map((row: { id: string | null }) => row.id)
      .filter(
        (id: string | null): id is string =>
          typeof id === 'string' && id.length > 0
      );
  }

  const inviteQuery = userId
    ? access.admin
        .from('workspace_invites')
        .delete()
        .eq('ws_id', access.normalizedWorkspaceId)
        .eq('user_id', userId)
    : inviteUserIds.length > 0
      ? access.admin
          .from('workspace_invites')
          .delete()
          .eq('ws_id', access.normalizedWorkspaceId)
          .in('user_id', inviteUserIds)
      : { error: undefined };

  const emailInviteQuery = userEmail
    ? access.admin
        .from('workspace_email_invites')
        .delete()
        .eq('ws_id', access.normalizedWorkspaceId)
        .eq('email', userEmail)
    : { error: undefined };

  const memberQuery = userId
    ? access.admin
        .from('workspace_members')
        .delete()
        .eq('ws_id', access.normalizedWorkspaceId)
        .eq('user_id', userId)
    : { error: undefined };

  const [inviteResult, emailInviteResult, memberResult] = await Promise.all([
    inviteQuery,
    emailInviteQuery,
    memberQuery,
  ]);

  if (inviteResult.error || emailInviteResult.error || memberResult.error) {
    console.error('Error removing CMS team member', {
      emailInviteError: emailInviteResult.error,
      inviteError: inviteResult.error,
      memberError: memberResult.error,
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { message: 'Error removing team member' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success', workspace_deleted: false });
}
