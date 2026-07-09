import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { normalizeAvatarImageSrc } from '@tuturuuu/utils/avatar-url';
import {
  MAX_COLOR_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_URL_LENGTH,
} from '@tuturuuu/utils/constants';
import { getCurrentWorkspaceUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  cancelPendingPostEmailsForWorkspaceUser,
  isWorkspaceUserInactiveForPostEmail,
  POST_EMAIL_INACTIVE_RECIPIENT_REASON,
} from '@/lib/post-email-queue';
import { syncWorkspaceUserGuestMembership } from '@/lib/user-groups/guest-membership';
import { validateWorkspaceApiKey } from '@/lib/workspace-api-key';

const userUpdateSchema = z.object({
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
});

interface Params {
  params: Promise<{
    wsId: string;
    userId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const { wsId, userId } = await params;

  if (!userId)
    return NextResponse.json({ message: 'Invalid user ID' }, { status: 400 });

  if (!wsId)
    return NextResponse.json(
      { message: 'Invalid workspace ID' },
      { status: 400 }
    );

  const apiKey = (await headers()).get('API_KEY');
  return apiKey
    ? getDataWithApiKey({ wsId, userId, apiKey })
    : getDataFromSession({ req: _, wsId, userId });
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId, userId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('update_users')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update users' },
      { status: 403 }
    );
  }

  const data = await req.json();

  // Extract is_guest and archive-related fields separately before validation
  const { is_guest, archived, archived_until, ...payloadToValidate } =
    data ?? {};

  // Validate the user payload against the schema (excluding is_guest and archive fields)
  const schemaResult = userUpdateSchema.safeParse(payloadToValidate);
  if (!schemaResult.success) {
    return NextResponse.json(
      {
        message: 'Invalid request body',
        errors: schemaResult.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const userPayload = schemaResult.data;

  // If archived is explicitly set to false, clear the archived_until date
  if (archived === false) {
    userPayload.archived_until = null;
  }

  // Include archived status in the update payload
  if (typeof archived === 'boolean') {
    userPayload.archived = archived;
  }
  if (archived_until !== undefined) {
    userPayload.archived_until = archived_until;
  }

  const sbAdmin = await createAdminClient();
  const supabase = await createClient(req);
  const { user: actorUser } = await resolveAuthenticatedSessionUser(supabase);

  // Get current user to check status changes
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

  // Update user
  const { data: updatedUser, error } = await sbAdmin.rpc(
    'admin_update_workspace_user_with_audit_actor',
    {
      p_ws_id: wsId,
      p_user_id: userId,
      p_payload: userPayload,
      p_actor_auth_uid: actorUser?.id ?? undefined,
    }
  );

  if (error || !updatedUser) {
    console.error('Error updating workspace user:', error);
    return NextResponse.json(
      { message: 'Error updating workspace user' },
      { status: 500 }
    );
  }

  const nextArchived =
    typeof archived === 'boolean' ? archived : currentUser.archived;
  const nextArchivedUntil =
    archived === false
      ? null
      : archived_until !== undefined
        ? archived_until
        : currentUser.archived_until;
  const shouldLogStatusChange =
    nextArchived !== currentUser.archived ||
    nextArchivedUntil !== currentUser.archived_until;
  let warning: string | undefined;

  if (shouldLogStatusChange) {
    const currentWorkspaceUser = await getCurrentWorkspaceUser(wsId);
    const { error: logError } = await sbAdmin
      .from('workspace_user_status_changes')
      .insert({
        user_id: updatedUser.id,
        ws_id: wsId,
        archived: nextArchived,
        archived_until: nextArchivedUntil,
        creator_id: currentWorkspaceUser?.virtual_user_id ?? null,
        actor_auth_uid: actorUser?.id ?? null,
        source: 'live',
      });

    if (logError) {
      console.error('Failed to log status change:', logError);
      // Don't fail the request if logging fails, just log it
    }
  }

  if (
    isWorkspaceUserInactiveForPostEmail({
      archived: nextArchived,
      archived_until: nextArchivedUntil,
    })
  ) {
    try {
      await cancelPendingPostEmailsForWorkspaceUser(sbAdmin, {
        userId,
        wsId,
        reason: POST_EMAIL_INACTIVE_RECIPIENT_REASON,
      });
    } catch (cancelError) {
      console.error(
        'Failed to cancel pending post emails for inactive workspace user:',
        cancelError
      );
      warning =
        'User was updated, but pending post emails could not be cancelled automatically.';
    }
  }

  if (typeof is_guest === 'boolean') {
    const guestWarning = await syncWorkspaceUserGuestMembership({
      isGuest: is_guest,
      sbAdmin,
      userId,
      wsId,
    });

    if (guestWarning) {
      warning = guestWarning;
    }
  }

  return NextResponse.json({ message: 'success', warning });
}

export async function DELETE(_: Request, { params }: Params) {
  const { wsId, userId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: _ });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('delete_users')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete users' },
      { status: 403 }
    );
  }
  const supabase = await createClient(_);
  const { user: actorUser } = await resolveAuthenticatedSessionUser(supabase);
  const sbAdmin = await createAdminClient();
  const { error } = await sbAdmin.rpc(
    'admin_delete_workspace_user_with_audit_actor',
    {
      p_ws_id: wsId,
      p_user_id: userId,
      p_actor_auth_uid: actorUser?.id ?? undefined,
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

async function getDataWithApiKey({
  wsId,
  userId,
  apiKey,
}: {
  wsId: string;
  userId: string;
  apiKey: string;
}) {
  const sbAdmin = await createAdminClient();

  const apiCheckQuery = validateWorkspaceApiKey(wsId, apiKey);

  const mainQuery = sbAdmin
    .from('workspace_users')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', userId);

  const [apiCheck, response] = await Promise.all([apiCheckQuery, mainQuery]);

  if (!apiCheck) {
    return NextResponse.json({ message: 'Invalid API key' }, { status: 401 });
  }

  const { data, error } = response;

  if (error) {
    console.error('Error fetching workspace user with API key:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json(normalizeWorkspaceUserAvatars(data));
}

async function getDataFromSession({
  req,
  wsId: rawWsId,
  userId,
}: {
  req: Request;
  wsId: string;
  userId: string;
}) {
  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, sbAdmin } = access.context;

  const { data, error } = await sbAdmin
    .from('workspace_users')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', userId);

  if (error) {
    console.error('Error fetching workspace user:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json(normalizeWorkspaceUserAvatars(data));
}

function normalizeWorkspaceUserAvatars<
  T extends { avatar_url?: string | null },
>(users: T[] | null) {
  return (
    users?.map((user) => ({
      ...user,
      avatar_url: normalizeAvatarImageSrc(user.avatar_url) ?? null,
    })) ?? users
  );
}
