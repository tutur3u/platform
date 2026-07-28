import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { PermissionId } from '@tuturuuu/types';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export const AI_KEY_CREATION_APPROVAL_REQUIRED =
  'AI_KEY_CREATION_APPROVAL_REQUIRED';

export async function authorizeAiStudioWorkspaceRequest(
  workspaceAlias: string,
  requiredPermission: PermissionId
) {
  const user = await getSatelliteAppSessionUser('ai');
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const workspace = await getWorkspace(workspaceAlias, {
    useAdmin: true,
    user,
  });
  if (!workspace?.joined) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      ),
    };
  }

  const permissions = await getPermissions({ user, wsId: workspace.id });
  if (!permissions?.containsPermission(requiredPermission)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    permissions,
    sbAdmin: await createAdminClient({ noCookie: true }),
    user,
    workspace,
  };
}

export async function getAiKeyCreationApproval(
  sbAdmin: TypedSupabaseClient,
  workspaceId: string
) {
  const { data, error } = await sbAdmin
    .schema('private')
    .from('workspace_ai_studio_policies')
    .select(
      'api_key_creation_approved, api_key_creation_decided_at, api_key_creation_decided_by'
    )
    .eq('ws_id', workspaceId)
    .maybeSingle();

  if (error) {
    console.warn('AI key creation approval unavailable', {
      code: error.code,
      workspaceId,
    });
  }

  return {
    approved: data?.api_key_creation_approved ?? false,
    decidedAt: data?.api_key_creation_decided_at ?? null,
    decidedBy: data?.api_key_creation_decided_by ?? null,
  };
}

export function aiKeyCreationApprovalRequiredResponse() {
  return NextResponse.json(
    {
      code: AI_KEY_CREATION_APPROVAL_REQUIRED,
      error: 'Platform-admin approval is required to issue an AI API key.',
    },
    { status: 403 }
  );
}
