import {
  getTeachBootstrap,
  listWorkspaceCourses,
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
  const bootstrap = await getTeachBootstrap(authOptions).catch(() => null);

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

  const coursesPayload = await listWorkspaceCourses(
    wsId,
    { page: 1, pageSize: 8, status: 'active' },
    authOptions
  ).catch(() => ({ count: 0, data: [], page: 1, pageSize: 8 }));

  const groups = coursesPayload.data.map((course) => ({
    attendance_amount: 0,
    id: course.id,
    name: course.name,
    sessions: [],
  }));
  const moduleCounts = coursesPayload.data.map(
    (course) => [course.id, course.modules_count] as const
  );

  return (
    <TeachDashboard
      bootstrap={bootstrap}
      groups={groups}
      moduleCounts={Object.fromEntries(moduleCounts)}
      totalGroups={coursesPayload.count}
      workspace={requestedWorkspace}
      wsId={wsId}
    />
  );
}
