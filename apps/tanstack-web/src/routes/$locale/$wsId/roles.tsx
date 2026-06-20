import { createFileRoute, redirect } from '@tanstack/react-router';
import { workspaceRolesRedirectHref } from '../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/roles')({
  loader: ({ params }) => {
    throw redirect({
      href: workspaceRolesRedirectHref(params.wsId),
      statusCode: 307,
    });
  },
});
