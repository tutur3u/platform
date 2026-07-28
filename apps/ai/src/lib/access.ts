import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cache } from 'react';

type SatelliteUser = NonNullable<
  Awaited<ReturnType<typeof getSatelliteAppSessionUser>>
>;
type JoinedWorkspace = NonNullable<Awaited<ReturnType<typeof getWorkspace>>>;

export async function getAiStudioWorkspaceAccess({
  user,
  workspace,
}: {
  user: SatelliteUser;
  workspace: JoinedWorkspace;
}) {
  const supabase = await createAdminClient();
  const [{ data: policy }, permissions] = await Promise.all([
    supabase
      .schema('private')
      .from('workspace_ai_studio_policies')
      .select(
        'allowed_models, denied_models, capture_enabled, content_retention_days, metadata_retention_days, api_key_creation_approved'
      )
      .eq('ws_id', workspace.id)
      .maybeSingle(),
    getPermissions({ user, wsId: workspace.id }),
  ]);

  if (!permissions) return null;

  return {
    apiKeyCreationApproved: policy?.api_key_creation_approved ?? false,
    permissions,
    policy,
  };
}

export const getAiStudioWorkspaceContext = cache(
  async (workspaceAlias: string) => {
    const user = await getSatelliteAppSessionUser('ai');
    if (!user?.id) return null;

    const workspace = await getWorkspace(workspaceAlias, {
      useAdmin: true,
      user,
    });
    if (!workspace?.joined) return null;

    const access = await getAiStudioWorkspaceAccess({ user, workspace });
    if (!access) return null;

    return {
      ...access,
      user,
      workspace,
    };
  }
);
