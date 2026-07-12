import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  MAX_COLOR_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_URL_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { getWorkspaceUserLinkForUser } from '@tuturuuu/utils/workspace-user-link';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { syncWorkspaceUserGuestMembership } from '../../lib/user-groups/guest-membership';

export interface WorkspaceUserMutationParams {
  params: Promise<{
    userId: string;
    wsId: string;
  }>;
}

export interface WorkspaceUserMutationActor {
  email?: string | null;
  id: string;
}

const WorkspaceUserUpdateSchema = z.object({
  id: z.string().max(MAX_NAME_LENGTH).optional(),
  full_name: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
  display_name: z.string().max(MAX_NAME_LENGTH).nullable().optional(),
  email: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
  phone: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
  gender: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
  birthday: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
  ethnicity: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
  guardian: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
  national_id: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
  address: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
  avatar_url: z.string().max(MAX_URL_LENGTH).nullable().optional(),
  note: z.string().max(MAX_MEDIUM_TEXT_LENGTH).nullable().optional(),
  archived: z.boolean().optional(),
  archived_until: z.string().max(MAX_COLOR_LENGTH).nullable().optional(),
  is_guest: z.boolean().optional(),
});

const CANCELLABLE_POST_EMAIL_STATUSES = [
  'queued',
  'processing',
  'failed',
  'blocked',
] as const;
const POST_EMAIL_INACTIVE_RECIPIENT_REASON =
  'Recipient is archived or temporarily archived.';

function isWorkspaceUserInactive({
  archived,
  archivedUntil,
}: {
  archived: boolean | null;
  archivedUntil: string | null;
}) {
  if (archived) return true;
  if (!archivedUntil) return false;

  const archivedUntilMs = Date.parse(archivedUntil);
  return Number.isFinite(archivedUntilMs) && archivedUntilMs > Date.now();
}

async function cancelPendingPostEmails(
  sbAdmin: TypedSupabaseClient,
  { userId, wsId }: { userId: string; wsId: string }
) {
  const now = new Date().toISOString();
  const { error } = await sbAdmin
    .from('post_email_queue')
    .update({
      status: 'cancelled',
      batch_id: null,
      claimed_at: null,
      cancelled_at: now,
      blocked_reason: null,
      last_error: POST_EMAIL_INACTIVE_RECIPIENT_REASON,
    })
    .eq('user_id', userId)
    .in('status', [...CANCELLABLE_POST_EMAIL_STATUSES])
    .eq('ws_id', wsId);

  if (error) throw error;
}

export async function handleUpdateWorkspaceUserRequest(
  request: Request,
  { params }: WorkspaceUserMutationParams,
  actor: WorkspaceUserMutationActor
) {
  const { userId, wsId: rawWsId } = await params;
  if (!userId || !rawWsId) {
    return NextResponse.json(
      { message: 'Invalid workspace or user ID' },
      { status: 400 }
    );
  }

  const wsId = await normalizeWorkspaceId(rawWsId);
  const permissions = await getPermissions({
    request,
    user: actor,
    wsId,
  });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!permissions.containsPermission('update_users')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update users' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const result = WorkspaceUserUpdateSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      {
        message: 'Invalid request body',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const { archived, archived_until } = result.data;
  const { is_guest, ...userPayload } = result.data;
  if (archived === false) {
    userPayload.archived_until = null;
  } else if (archived_until !== undefined) {
    userPayload.archived_until = archived_until;
  }
  if (archived !== undefined) {
    userPayload.archived = archived;
  }

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data: currentUser, error: fetchError } = await sbAdmin
    .from('workspace_users')
    .select('archived, archived_until')
    .eq('ws_id', wsId)
    .eq('id', userId)
    .single();

  if (fetchError || !currentUser) {
    console.error('Error fetching workspace user:', fetchError);
    return NextResponse.json(
      { message: 'Error fetching workspace user' },
      { status: 500 }
    );
  }

  const { data: updatedUserData, error: updateError } = await sbAdmin.rpc(
    'admin_update_workspace_user_with_audit_actor',
    {
      p_ws_id: wsId,
      p_user_id: userId,
      p_payload: userPayload,
      p_actor_auth_uid: actor.id,
    }
  );
  const updatedUser = updatedUserData as { id?: string } | null;

  if (updateError || !updatedUser?.id) {
    console.error('Error updating workspace user:', updateError);
    return NextResponse.json(
      { message: 'Error updating workspace user' },
      { status: 500 }
    );
  }

  const nextArchived = archived ?? currentUser.archived;
  const nextArchivedUntil =
    archived === false
      ? null
      : archived_until !== undefined
        ? archived_until
        : currentUser.archived_until;
  const statusChanged =
    nextArchived !== currentUser.archived ||
    nextArchivedUntil !== currentUser.archived_until;
  let warning: string | undefined;

  if (statusChanged) {
    const actorLink = await getWorkspaceUserLinkForUser(wsId, actor.id).catch(
      () => null
    );
    const { error: logError } = await sbAdmin
      .from('workspace_user_status_changes')
      .insert({
        user_id: updatedUser.id,
        ws_id: wsId,
        archived: nextArchived,
        archived_until: nextArchivedUntil,
        creator_id: actorLink?.virtual_user_id ?? null,
        actor_auth_uid: actor.id,
        source: 'live',
      });

    if (logError) {
      console.error('Failed to log status change:', logError);
    }
  }

  if (
    isWorkspaceUserInactive({
      archived: nextArchived,
      archivedUntil: nextArchivedUntil,
    })
  ) {
    try {
      await cancelPendingPostEmails(sbAdmin, { userId, wsId });
    } catch (error) {
      console.error(
        'Failed to cancel pending post emails for inactive workspace user:',
        error
      );
      warning =
        'User was updated, but pending post emails could not be cancelled automatically.';
    }
  }

  if (is_guest !== undefined) {
    const guestWarning = await syncWorkspaceUserGuestMembership({
      isGuest: is_guest,
      sbAdmin,
      userId,
      wsId,
    });
    if (guestWarning) warning = guestWarning;
  }

  return NextResponse.json({ message: 'success', warning });
}

export async function handleDeleteWorkspaceUserRequest(
  request: Request,
  { params }: WorkspaceUserMutationParams,
  actor: WorkspaceUserMutationActor
) {
  const { userId, wsId: rawWsId } = await params;
  if (!userId || !rawWsId) {
    return NextResponse.json(
      { message: 'Invalid workspace or user ID' },
      { status: 400 }
    );
  }

  const wsId = await normalizeWorkspaceId(rawWsId);
  const permissions = await getPermissions({
    request,
    user: actor,
    wsId,
  });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!permissions.containsPermission('delete_users')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete users' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { error } = await sbAdmin.rpc(
    'admin_delete_workspace_user_with_audit_actor',
    {
      p_ws_id: wsId,
      p_user_id: userId,
      p_actor_auth_uid: actor.id,
    }
  );

  if (error) {
    console.error('Error deleting workspace user:', error);
    return NextResponse.json(
      { message: 'Error deleting workspace user' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
