import { createFileRoute, redirect } from '@tanstack/react-router';
import { isHabitsEnabled } from '../../../../lib/platform/habits';
import {
  workspaceDashboardRedirectHref,
  workspaceHabitsRedirectHref,
} from '../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/tasks/habits')({
  loader: async ({ params }) => {
    const enabled = await isHabitsEnabled({
      data: { workspaceId: params.wsId },
    });

    throw redirect({
      href: enabled
        ? workspaceHabitsRedirectHref(params.wsId)
        : workspaceDashboardRedirectHref(params.wsId),
      statusCode: 307,
    });
  },
});
