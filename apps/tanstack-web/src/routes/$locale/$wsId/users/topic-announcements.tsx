import { createFileRoute, redirect } from '@tanstack/react-router';
import { workspaceTopicAnnouncementsRedirectHref } from '../../../../lib/platform/redirects';

export const Route = createFileRoute(
  '/$locale/$wsId/users/topic-announcements'
)({
  loader: ({ location, params }) => {
    const currentPath = location.pathname.replace(/\/+$/u, '');
    const parentPath =
      `/${params.locale}/${params.wsId}/users/topic-announcements`.replace(
        /\/+$/u,
        ''
      );

    if (currentPath !== parentPath) {
      return;
    }

    throw redirect({
      href: workspaceTopicAnnouncementsRedirectHref(params.wsId),
      statusCode: 307,
    });
  },
});
