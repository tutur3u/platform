import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buildCmsStrings } from '@/features/cms-studio/cms-strings';
import { CmsSettingsClient } from '@/features/settings/cms-settings-client';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function CmsSettingsPage({ params }: Props) {
  const { wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (!access.canAccessWorkspace) {
    redirect('/no-access');
  }

  const t = await getTranslations('external-projects');
  const canManageMembers =
    access.isRootAdmin ||
    Boolean(
      access.workspacePermissions?.containsPermission(
        'manage_workspace_members'
      )
    );
  const canManageRoles =
    access.isRootAdmin ||
    Boolean(
      access.workspacePermissions?.containsPermission('manage_workspace_roles')
    );

  return (
    <CmsSettingsClient
      binding={access.binding}
      canManageMembers={canManageMembers}
      canManageRoles={canManageRoles}
      strings={buildCmsStrings(t)}
      workspaceId={access.normalizedWorkspaceId}
    />
  );
}
