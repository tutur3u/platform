import { ExternalProjectWorkspaceAccessPage } from '@tuturuuu/ui/custom/workspace-access';
import { redirect } from 'next/navigation';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function CmsMembersPage({ params }: Props) {
  const { wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (access.isInternalWorkspace && access.canAccessAdmin) {
    redirect(`/${wsId}/projects`);
  }

  if (!access.canAccessWorkspace) {
    redirect('/no-access');
  }

  const canViewMembersPage =
    access.isRootAdmin ||
    Boolean(
      access.workspacePermissions?.containsPermission(
        'manage_workspace_members'
      )
    ) ||
    Boolean(
      access.workspacePermissions?.containsPermission('manage_workspace_roles')
    );

  if (!canViewMembersPage) {
    redirect('/no-access');
  }

  const normalizedWorkspaceId = access.normalizedWorkspaceId;

  return (
    <ExternalProjectWorkspaceAccessPage
      initialContext={{
        boundProjectName:
          access.binding?.canonical_project?.display_name ?? null,
        canManageMembers:
          access.isRootAdmin ||
          Boolean(
            access.workspacePermissions?.containsPermission(
              'manage_workspace_members'
            )
          ),
        canManageRoles:
          access.isRootAdmin ||
          Boolean(
            access.workspacePermissions?.containsPermission(
              'manage_workspace_roles'
            )
          ),
        workspaceId: normalizedWorkspaceId,
      }}
    />
  );
}
