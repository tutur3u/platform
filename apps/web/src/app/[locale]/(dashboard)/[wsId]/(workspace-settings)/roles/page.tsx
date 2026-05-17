import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { WorkspaceRolesClient } from './roles-client';

export const metadata: Metadata = {
  title: 'Roles',
  description:
    'Manage Roles in the Workspace Settings area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceRolesPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ workspace, wsId }) => {
        if (workspace.personal) redirect(`/${wsId}/settings`);

        const supabase = await createClient();

        const workspacePermissions = await getPermissions({
          wsId,
        });
        if (!workspacePermissions) notFound();
        const { withoutPermission } = workspacePermissions;

        if (withoutPermission('manage_workspace_roles'))
          redirect(`/${wsId}/settings`);

        const { user } = await resolveAuthenticatedSessionUser(supabase);

        return <WorkspaceRolesClient user={user} wsId={wsId} />;
      }}
    </WorkspaceWrapper>
  );
}
