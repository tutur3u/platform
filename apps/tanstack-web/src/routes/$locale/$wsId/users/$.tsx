import { createFileRoute, redirect } from '@tanstack/react-router';
import { workspaceContactsUsersRedirectHref } from '../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/users/$')({
  loader: ({ location, params }) => {
    throw redirect({
      href: workspaceContactsUsersRedirectHref(params.wsId, {
        searchParams: location.search,
        splat: params._splat,
      }),
      statusCode: 307,
    });
  },
});
