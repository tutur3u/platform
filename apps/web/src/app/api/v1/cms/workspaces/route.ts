import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  getWorkspaces,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  hasRootExternalProjectsAdminPermission,
  resolveWorkspaceExternalProjectBinding,
} from '@/lib/external-projects/access';

function hasWorkspaceExternalProjectPermission(
  permissions: Awaited<ReturnType<typeof getPermissions>> | null
) {
  if (!permissions) return false;

  return (
    permissions.containsPermission('manage_external_projects') ||
    permissions.containsPermission('publish_external_projects')
  );
}

export async function GET(request: Request) {
  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [workspaces, rootPermissions] = await Promise.all([
      getWorkspaces({ useAdmin: true }),
      getPermissions({ wsId: ROOT_WORKSPACE_ID, request }),
    ]);

    if (!workspaces) {
      return NextResponse.json([]);
    }

    const isRootAdmin = hasRootExternalProjectsAdminPermission(rootPermissions);

    const accessibleWorkspaces = (
      await Promise.all(
        workspaces.map(async (workspace) => {
          if (workspace.id === ROOT_WORKSPACE_ID) {
            return isRootAdmin ? workspace : null;
          }

          const [binding, permissions] = await Promise.all([
            resolveWorkspaceExternalProjectBinding(workspace.id),
            getPermissions({ wsId: workspace.id, request }),
          ]);

          if (!binding.enabled || !binding.canonical_project) {
            return null;
          }

          if (
            !hasWorkspaceExternalProjectPermission(permissions) &&
            !isRootAdmin
          ) {
            return null;
          }

          return workspace;
        })
      )
    ).filter(Boolean);

    return NextResponse.json(accessibleWorkspaces);
  } catch (error) {
    console.error('Failed to load CMS workspaces', error);
    return NextResponse.json(
      { error: 'Failed to load CMS workspaces' },
      { status: 500 }
    );
  }
}
