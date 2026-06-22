import { createFileRoute, redirect } from '@tanstack/react-router';
import { workspaceTopicAnnouncementsRedirectHref } from '../../../../lib/platform/redirects';

export const Route = createFileRoute(
  '/$locale/$wsId/users/topic-announcements'
)({
  loader: ({ params }) => {
    throw redirect({
      href: workspaceTopicAnnouncementsRedirectHref(params.wsId),
      statusCode: 307,
    });
  },
});
