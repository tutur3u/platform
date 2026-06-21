import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildHiveDashboardRedirectHref } from '../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/hive')({
  loader: ({ location }) => {
    throw redirect({
      href: buildHiveDashboardRedirectHref({
        searchParams: location.searchStr,
      }),
      statusCode: 307,
    });
  },
});
