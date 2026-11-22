import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  creatorProtectedResponse,
  guardedRemovalRefusal,
} from './guarded-removal';
import type { ExternalProjectTeamAccess } from './team-access';

export {
  WORKSPACE_CREATOR_PROTECTED,
  WORKSPACE_LAST_MANAGER,
} from './guarded-removal';

/**
 * Postgres reads a uuid written without hyphens, with other hyphen groupings
 * or in braces as the same value. Only the canonical 8-4-4-4-12 spelling is
 * accepted here, so the id compared with the creator is the id the delete
 * matches.
 */
export const memberIdSchema = z.guid();

const sameId = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();

const errorResponse = () =>
  NextResponse.json({ message: 'Error removing team member' }, { status: 500 });

/**
 * Removes a joined member (`?id=`) and/or cancels an invitation (`?email=`).
 *
 * The workspace creator is never removed here. The creator can always manage
 * the workspace, so refusing this keeps at least one person who can manage
 * members in every workspace whose creator is a member. This route-level
 * check is the first layer. The membership itself is removed only by
 * `remove_workspace_member_guarded`, which takes the workspace removal lock,
 * authorizes the actor again, refuses the creator, and refuses a removal that
 * would leave no full member who can manage members. Invitations are
 * cancelled only after that function removed the member or found nothing to
 * remove, so a refused removal cancels nothing.
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
      return creatorProtectedResponse();
    }

    const { data: result, error: removalError } = await access.admin.rpc(
      'remove_workspace_member_guarded',
      {
        p_actor_id: access.user.id,
        p_user_id: userId,
        p_ws_id: access.normalizedWorkspaceId,
      }
    );
    const refusal = guardedRemovalRefusal({
      error: removalError,
      failureResponse: errorResponse,
      kind: 'member',
      result,
      wsId: access.normalizedWorkspaceId,
    });
    if (refusal) return refusal;
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

  const [inviteResult, emailInviteResult] = await Promise.all([
    inviteQuery,
    emailInviteQuery,
  ]);

  if (inviteResult.error || emailInviteResult.error) {
    console.error('Error removing CMS team member', {
      emailInviteError: emailInviteResult.error,
      inviteError: inviteResult.error,
      wsId: access.normalizedWorkspaceId,
    });
    return errorResponse();
  }

  return NextResponse.json({ message: 'success', workspace_deleted: false });
}
