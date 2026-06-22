import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { isTanStackHabitsEnabled } from '../../../../lib/platform/habits';
import {
  workspaceDashboardRedirectHref,
  workspaceHabitsRedirectHref,
} from '../../../../lib/platform/redirects';

const getHabitsEnabled = createServerFn({ method: 'GET' })
  .validator((data: { wsId: string }) => data)
  .handler(({ data }) => isTanStackHabitsEnabled(data.wsId));

export const Route = createFileRoute('/$locale/$wsId/tasks/habits')({
  loader: async ({ params }) => {
    const enabled = await getHabitsEnabled({ data: { wsId: params.wsId } });

    throw redirect({
      href: enabled
        ? workspaceHabitsRedirectHref(params.wsId)
        : workspaceDashboardRedirectHref(params.wsId),
      statusCode: 307,
    });
  },
});
