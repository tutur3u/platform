import {
  TaskProgressPage,
  type TaskProgressView,
} from '@tuturuuu/ui/tu-do/progress/task-progress-page';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';

interface TaskProgressRouteProps {
  params: Promise<{
    wsId: string;
  }>;
  view: TaskProgressView;
}

export async function TaskProgressRoute({
  params,
  view,
}: TaskProgressRouteProps) {
  const { wsId: routeWsId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(routeWsId);
  if (!workspace) notFound();

  const permissions = await getPermissions({ wsId: workspace.id });
  if (!permissions) notFound();
  if (permissions.withoutPermission('manage_projects')) {
    redirect(`/${routeWsId}`);
  }

  return (
    <TaskProgressPage routeWsId={routeWsId} view={view} wsId={workspace.id} />
  );
}
