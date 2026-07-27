import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cache } from 'react';

export const getAiStudioWorkspaceContext = cache(
  async (workspaceAlias: string) => {
    const user = await getSatelliteAppSessionUser('ai');
    if (!user?.id) return null;

    const workspace = await getWorkspace(workspaceAlias, {
      useAdmin: true,
      user,
    });
    if (!workspace?.joined) return null;

    const supabase = await createAdminClient();
    const [{ data: global }, { data: policy }, permissions] = await Promise.all(
      [
        supabase
          .schema('private')
          .from('ai_studio_global_settings')
          .select('globally_enabled, workspace_default_enabled')
          .eq('singleton', true)
          .maybeSingle(),
        supabase
          .schema('private')
          .from('workspace_ai_studio_policies')
          .select(
            'state, allowed_models, denied_models, capture_enabled, content_retention_days, metadata_retention_days'
          )
          .eq('ws_id', workspace.id)
          .maybeSingle(),
        getPermissions({ user, wsId: workspace.id }),
      ]
    );

    const globallyEnabled = Boolean(global?.globally_enabled);
    const state = policy?.state ?? 'inherit';
    const enabled =
      globallyEnabled &&
      (state === 'enabled' ||
        (state === 'inherit' && Boolean(global?.workspace_default_enabled)));

    if (!permissions) return null;

    return {
      enabled,
      permissions,
      policy,
      user,
      workspace,
    };
  }
);
