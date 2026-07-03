import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  getWorkspaces,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  hasRootExternalProjectsAdminPermission,
  resolveWorkspaceExternalProjectBinding,
} from '@/lib/external-projects/access';
import { serverLogger } from '@/lib/infrastructure/log-drain';

type JoinedWorkspace = NonNullable<
  Awaited<ReturnType<typeof getWorkspaces>>
>[number];

function hasWorkspaceExternalProjectPermission(
  permissions: Awaited<ReturnType<typeof getPermissions>> | null
) {
  if (!permissions) return false;

  return (
    permissions.containsPermission('manage_external_projects') ||
    permissions.containsPermission('publish_external_projects')
  );
}

export const GET = withSessionAuth(
  async (_request, { user }) => {
    try {
      const actor = { email: user.email ?? null, id: user.id };
      const [workspaces, rootPermissions] = await Promise.all([
        getWorkspaces({ useAdmin: true, user: actor }),
        getPermissions({ user: actor, wsId: ROOT_WORKSPACE_ID }),
      ]);

      if (!workspaces) {
        return NextResponse.json([]);
      }

      const isRootAdmin =
        hasRootExternalProjectsAdminPermission(rootPermissions);

      const accessibleWorkspaces = (
        await Promise.all(
          workspaces.map(async (workspace) => {
            if (workspace.id === ROOT_WORKSPACE_ID) {
              return isRootAdmin ? workspace : null;
            }

            const [binding, permissions] = await Promise.all([
              resolveWorkspaceExternalProjectBinding(workspace.id),
              getPermissions({ user: actor, wsId: workspace.id }),
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
      ).filter((workspace): workspace is JoinedWorkspace => workspace !== null);

      return NextResponse.json(accessibleWorkspaces);
    } catch (error) {
      serverLogger.error('Failed to load CMS workspaces', error);
      return NextResponse.json(
        { error: 'Failed to load CMS workspaces' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
