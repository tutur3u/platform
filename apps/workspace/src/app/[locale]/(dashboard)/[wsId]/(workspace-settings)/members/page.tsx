import type { WorkspaceAccessTab } from '@tuturuuu/ui/custom/workspace-access';
import { StandardWorkspaceAccessPage } from '@tuturuuu/ui/custom/workspace-access';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import {
  getPermissions,
  verifyHasSecrets,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export const metadata: Metadata = {
  title: 'Members',
  description:
    'Manage Members in the Workspace Settings area of your Tuturuuu workspace.',
};

const WORKSPACE_ACCESS_TABS: WorkspaceAccessTab[] = [
  'people',
  'roles',
  'defaults-member',
  'defaults-guest',
];

function resolveInitialTab(tab: string | undefined): WorkspaceAccessTab {
  return WORKSPACE_ACCESS_TABS.includes(tab as WorkspaceAccessTab)
    ? (tab as WorkspaceAccessTab)
    : 'people';
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    tab?: string;
  }>;
}

export default async function WorkspaceMembersPage({
  params,
  searchParams,
}: Props) {
  const { tab } = await searchParams;

  return (
    <WorkspaceWrapper params={params}>
      {async ({ workspace, wsId }) => {
        if (workspace.personal) redirect(`/${wsId}/settings`);

        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { withoutPermission } = permissions;

        if (withoutPermission('manage_workspace_members'))
          redirect(`/${wsId}/settings`);

        const user = await getCurrentUser();
        const disableInvite = await verifyHasSecrets(wsId, ['DISABLE_INVITE']);

        const canManageMembers = !withoutPermission('manage_workspace_members');
        const canManageRoles = !withoutPermission('manage_workspace_roles');

        return (
          <StandardWorkspaceAccessPage
            disableInvite={disableInvite}
            initialContext={{
              canManageMembers,
              canManageRoles,
              currentUserEmail: user?.email ?? null,
              workspaceId: wsId,
            }}
            initialTab={resolveInitialTab(tab)}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
