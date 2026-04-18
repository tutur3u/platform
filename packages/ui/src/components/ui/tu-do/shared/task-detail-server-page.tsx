import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { redirect } from 'next/navigation';
import { TaskLegacyRouteRecovery } from './task-legacy-route-recovery';

interface Props {
  params: Promise<{
    locale?: string;
    wsId: string;
    taskId: string;
  }>;
  routePrefix?: string;
}

/**
 * Legacy task-detail route compatibility page.
 * Resolves old `/{wsId}/tasks/{taskId}` URLs and redirects them to the
 * canonical board-backed task URL.
 */
export default async function TaskDetailServerPage({
  params,
  routePrefix = '/tasks',
}: Props) {
  const { wsId, taskId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <TaskLegacyRouteRecovery
      routePrefix={routePrefix}
      taskId={taskId}
      workspaceId={wsId}
    />
  );
}
