import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { WorkspaceRolesClient } from './roles-client';

const REQUIRED_PERMISSION = 'manage_workspace_roles';

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

async function getRolesPageContext(wsId: string) {
  const supabase = await createClient();

  const [workspacePermissions, { user }] = await Promise.all([
    getPermissions({ wsId }),
    resolveAuthenticatedSessionUser(supabase),
  ]);

  if (!workspacePermissions) {
    notFound();
  }

  if (workspacePermissions.withoutPermission(REQUIRED_PERMISSION)) {
    redirect(`/${wsId}/settings`);
  }

  return { user };
}

export default async function WorkspaceRolesPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ workspace, wsId }) => {
        if (workspace.personal) {
          redirect(`/${wsId}/settings`);
        }

        const { user } = await getRolesPageContext(wsId);

        return (
          <Suspense fallback={<RolesPageFallback />}>
            <WorkspaceRolesClient user={user} wsId={wsId} />
          </Suspense>
        );
      }}
    </WorkspaceWrapper>
  );
}

function RolesPageFallback() {
  return (
    <div className="space-y-4">
      <div className="grid h-10 w-full grid-cols-1 gap-2 rounded-lg bg-muted p-1 md:grid-cols-3">
        <div className="animate-pulse rounded-md bg-background" />
        <div className="animate-pulse rounded-md bg-background" />
        <div className="animate-pulse rounded-md bg-background" />
      </div>
      <div className="space-y-4 rounded-lg border bg-background p-4">
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
