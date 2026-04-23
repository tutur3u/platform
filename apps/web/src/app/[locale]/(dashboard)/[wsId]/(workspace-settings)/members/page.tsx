import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import {
  getPermissions,
  verifyHasSecrets,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import MembersClientShell from './_components/members-client-shell';

export const metadata: Metadata = {
  title: 'Members',
  description:
    'Manage Members in the Workspace Settings area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceMembersPage({ params }: Props) {
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

        return (
          <MembersClientShell
            workspace={workspace}
            wsId={wsId}
            currentUser={user}
            canManageMembers={canManageMembers}
            disableInvite={disableInvite}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
