import { createFileRoute, redirect } from '@tanstack/react-router';
import { workspaceContactsUsersRedirectHref } from '../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/users/')({
  loader: ({ location, params }) => {
    throw redirect({
      href: workspaceContactsUsersRedirectHref(params.wsId, {
        searchParams: location.search,
      }),
      statusCode: 307,
    });
  },
});
