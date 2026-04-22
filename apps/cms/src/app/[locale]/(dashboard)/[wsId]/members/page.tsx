import { createClient } from '@tuturuuu/supabase/next/server';
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
  const supabase = await createClient();

  if (access.isInternalWorkspace && access.canAccessAdmin) {
    redirect(`/${wsId}/projects`);
  }

  if (!access.canAccessWorkspace) {
    redirect('/no-access');
  }

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <CmsMembersSection
      boundProjectName={access.binding.canonical_project?.display_name ?? null}
      canManageMembers={canManageMembers}
      canManageRoles={canManageRoles}
      currentUserEmail={user?.email ?? null}
      workspaceId={access.normalizedWorkspaceId}
    />
  );
}
