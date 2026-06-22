import { createFileRoute, redirect } from '@tanstack/react-router';
import { workspaceUserDatabaseRedirectHref } from '../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/workforce')({
  loader: ({ params }) => {
    throw redirect({
      href: workspaceUserDatabaseRedirectHref(params.wsId),
      statusCode: 307,
    });
  },
});
