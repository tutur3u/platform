import { createFileRoute, redirect } from '@tanstack/react-router';
import { workspaceInfrastructureAppCoordinationRedirectHref } from '../../../../../lib/platform/redirects';

export const Route = createFileRoute(
  '/$locale/$wsId/settings/infrastructure/app-coordination'
)({
  loader: ({ params }) => {
    throw redirect({
      href: workspaceInfrastructureAppCoordinationRedirectHref(params.wsId),
      statusCode: 307,
    });
  },
});
