import {
  getTulearnBootstrap,
  listWorkspaceCourseModules,
  listWorkspaceUserGroups,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { TeachDashboard } from '@/components/teach-dashboard';
import { redirect } from '@/i18n/navigation';

export default async function WorkspaceTeachDashboardPage({
  params,
}: {
  params: Promise<{ locale: string; wsId: string }>;
}) {
  const { locale, wsId } = await params;
  const requestHeaders = await headers();
  const authOptions = withForwardedInternalApiAuth(requestHeaders);
  const bootstrap = await getTulearnBootstrap(authOptions).catch(() => null);

  if (!bootstrap) {
    redirect({ href: `/login?next=/${wsId}`, locale });
    throw new Error('Redirecting to Teach login');
  }

  const requestedWorkspace = bootstrap.workspaces.find(
    (workspace) => workspace.id === wsId
  );

  if (!requestedWorkspace) {
    const fallbackWorkspaceId = bootstrap.workspaces[0]?.id;
    redirect({
      href: fallbackWorkspaceId ? `/${fallbackWorkspaceId}` : '/dashboard',
      locale,
    });
    throw new Error('Redirecting to an available Teach workspace');
  }

  const groupsPayload = await listWorkspaceUserGroups(
    wsId,
    { page: 1, pageSize: 8, status: 'active' },
    authOptions
  ).catch(() => ({ count: 0, data: [], page: 1, pageSize: 8 }));

  const moduleCounts = await Promise.all(
    groupsPayload.data.slice(0, 6).map(async (group) => {
      const modules = await listWorkspaceCourseModules(
        wsId,
        group.id,
        authOptions
      ).catch(() => []);
      return [group.id, modules.length] as const;
    })
  );

  return (
    <TeachDashboard
      bootstrap={bootstrap}
      groups={groupsPayload.data}
      moduleCounts={Object.fromEntries(moduleCounts)}
      totalGroups={groupsPayload.count}
      workspace={requestedWorkspace}
      wsId={wsId}
    />
  );
}
