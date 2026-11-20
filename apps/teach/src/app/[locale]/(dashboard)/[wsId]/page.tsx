import {
  getTeachDashboardStats,
  listWorkspaceCourses,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { TeachDashboard } from '@/components/teach-dashboard';
import { redirect } from '@/i18n/navigation';
import { getTeachRequestBootstrap } from '@/lib/teach-bootstrap';

export default async function WorkspaceTeachDashboardPage({
  params,
}: {
  params: Promise<{ locale: string; wsId: string }>;
}) {
  const { locale, wsId } = await params;
  const requestHeaders = await headers();
  const authOptions = withForwardedInternalApiAuth(requestHeaders);
  const bootstrap = await getTeachRequestBootstrap(requestHeaders).catch(
    () => null
  );

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

  const [courses, dashboardStats] = await Promise.all([
    listWorkspaceCourses(
      wsId,
      { page: 1, pageSize: 8, status: 'active' },
      authOptions
    ).catch(() => null),
    getTeachDashboardStats(wsId, authOptions).catch(() => null),
  ]);

  return (
    <TeachDashboard
      courses={courses}
      dashboardStats={dashboardStats}
      workspace={requestedWorkspace}
      wsId={wsId}
    />
  );
}
