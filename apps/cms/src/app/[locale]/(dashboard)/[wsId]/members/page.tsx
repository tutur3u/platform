import { redirect } from 'next/navigation';
import { CmsMembersSection } from '@/features/settings/cms-members-section';
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

  return <CmsMembersSection workspaceSlug={wsId} />;
}
