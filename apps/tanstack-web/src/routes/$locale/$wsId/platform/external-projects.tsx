import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildCmsRedirectHref } from '../../../../lib/platform/redirects';

export const Route = createFileRoute(
  '/$locale/$wsId/platform/external-projects'
)({
  loader: () => {
    throw redirect({
      href: buildCmsRedirectHref('/internal/admin'),
      statusCode: 307,
    });
  },
});
