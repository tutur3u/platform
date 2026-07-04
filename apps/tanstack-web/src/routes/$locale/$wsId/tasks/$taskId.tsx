import { createFileRoute } from '@tanstack/react-router';
import { TaskLegacyRouteRecovery } from '../../../../components/tasks/task-legacy-route-recovery';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';

export const Route = createFileRoute('/$locale/$wsId/tasks/$taskId')({
  component: TaskDetailRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'View and edit task details in your Tuturuuu workspace.',
      locale,
      title: 'Task Details',
    });
  },
  loader: async ({ params }) => {
    // Legacy TaskDetailServerPage gates auth only (getCurrentUser() ->
    // redirect('/login')); it resolves no workspace and checks no permission.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/tasks/${params.taskId}`,
    });
  },
});

function TaskDetailRoutePage() {
  const { wsId, taskId } = Route.useParams();

  // Legacy renders the recovery component which resolves the task's board and
  // redirects to the canonical board-backed URL. This uses the tanstack-web
  // fork (TanStack Router navigation) instead of the next/navigation original.
  return (
    <TaskLegacyRouteRecovery
      routePrefix="/tasks"
      taskId={taskId}
      workspaceId={wsId}
    />
  );
}
