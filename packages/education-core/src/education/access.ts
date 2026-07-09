import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { PermissionId } from '@tuturuuu/types/db';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { ENABLE_EDUCATION_SECRET } from '../tulearn/constants';
import type { EducationAuthContext } from '../types';

export const EDUCATION_WORKSPACE_PERMISSION = 'ai_lab' satisfies PermissionId;
export const EDUCATION_ATTEMPTS_WORKSPACE_PERMISSION =
  'view_user_groups_reports' satisfies PermissionId;

export type EducationAccessSuccess = {
  normalizedWsId: string;
  ok: true;
  sbAdmin: TypedSupabaseClient;
};

export type EducationAccessFailure = {
  ok: false;
  response: NextResponse;
};

export type EducationAccessResult =
  | EducationAccessFailure
  | EducationAccessSuccess;

function educationAccessFailure(message: string, status: number) {
  return {
    ok: false,
    response: NextResponse.json({ message }, { status }),
  } satisfies EducationAccessFailure;
}

export async function checkEducationWorkspaceAccess({
  context,
  permission = EDUCATION_WORKSPACE_PERMISSION,
  wsId,
}: {
  context: EducationAuthContext;
  permission?: PermissionId | readonly PermissionId[];
  wsId: string;
}): Promise<EducationAccessResult> {
  let normalizedWsId: string;
  try {
    normalizedWsId = await normalizeWorkspaceId(wsId, context.supabase);
  } catch {
    return educationAccessFailure('Invalid workspace', 400);
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: normalizedWsId,
    userId: context.user.id,
    supabase: context.supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return educationAccessFailure('Failed to verify workspace access', 500);
  }

  if (!membership.ok) {
    return educationAccessFailure(
      "You don't have access to this workspace",
      403
    );
  }

  const sbAdmin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;

  const { data: educationSecret, error: educationSecretError } = await sbAdmin
    .from('workspace_secrets')
    .select('value')
    .eq('ws_id', normalizedWsId)
    .eq('name', ENABLE_EDUCATION_SECRET)
    .maybeSingle();

  if (educationSecretError) {
    console.error('Failed to verify education feature flag', {
      error: educationSecretError,
      wsId: normalizedWsId,
    });
    return educationAccessFailure('Failed to verify education access', 500);
  }

  const educationEnabled =
    educationSecret?.value?.trim().toLowerCase() === 'true';
  if (!educationEnabled) {
    return educationAccessFailure(
      'Education is not enabled for this workspace',
      404
    );
  }

  const permissions = await getPermissions({
    user: context.user,
    wsId: normalizedWsId,
  });

  const requiredPermissions = Array.isArray(permission)
    ? permission
    : [permission];

  if (
    !permissions ||
    requiredPermissions.every((requiredPermission) =>
      permissions.withoutPermission(requiredPermission)
    )
  ) {
    return educationAccessFailure('Insufficient permissions', 403);
  }

  return {
    normalizedWsId,
    ok: true,
    sbAdmin,
  };
}

export async function requireEducationWorkspaceAccess(options: {
  context: EducationAuthContext;
  permission?: PermissionId | readonly PermissionId[];
  wsId: string;
}) {
  const access = await checkEducationWorkspaceAccess(options);
  return access.ok ? access : access.response;
}
