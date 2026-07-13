import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { syncWorkspaceUserGuestMembership } from '../../lib/user-groups/guest-membership';
import type { WorkspaceUserMutationActor } from './workspace-user';

export interface WorkspaceUserCollectionParams {
  params: Promise<{
    wsId: string;
  }>;
}

const CreateUserSchema = z.object({
  full_name: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  display_name: z.string().max(MAX_NAME_LENGTH).optional(),
  email: z.email().optional(),
  phone: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  gender: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  birthday: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
  ethnicity: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  guardian: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  national_id: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  address: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  note: z.string().max(MAX_MEDIUM_TEXT_LENGTH).optional(),
  is_guest: z.boolean().optional(),
});

export async function handleCreateWorkspaceUserRequest(
  request: Request,
  { params }: WorkspaceUserCollectionParams,
  actor: WorkspaceUserMutationActor
) {
  const { wsId: rawWsId } = await params;
  if (!rawWsId) {
    return NextResponse.json(
      { message: 'Invalid workspace ID' },
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
  if (!permissions.containsPermission('create_users')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create users' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const validationResult = CreateUserSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      {
        message: 'Invalid request body',
        errors: validationResult.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const { is_guest, ...userPayload } = validationResult.data;
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data: createdUser, error } = await sbAdmin.rpc(
    'admin_create_workspace_user_with_audit_actor',
    {
      p_ws_id: wsId,
      p_payload: userPayload,
      p_actor_auth_uid: actor.id,
    }
  );

  if (error) {
    console.error('Error creating workspace user:', error);
    return NextResponse.json(
      { message: 'Error creating workspace user' },
      { status: 500 }
    );
  }

  let warning: string | undefined;
  if (is_guest && createdUser?.id) {
    warning = await syncWorkspaceUserGuestMembership({
      isGuest: true,
      sbAdmin,
      userId: createdUser.id,
      warningMessages: {
        linkFailed: 'User created, but failed to link to guest group.',
        noGuestGroups:
          'User created, but no guest group found in this workspace.',
        resolveFailed:
          'User created, but no guest group found in this workspace.',
      },
      wsId,
    });
  }

  return NextResponse.json({ message: 'success', warning });
}
