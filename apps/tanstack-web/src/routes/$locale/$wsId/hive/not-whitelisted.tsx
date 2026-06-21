import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildHiveNotWhitelistedRedirectHref } from '../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/hive/not-whitelisted')({
  loader: ({ location }) => {
    throw redirect({
      href: buildHiveNotWhitelistedRedirectHref({
        searchParams: location.searchStr,
      }),
      statusCode: 307,
    });
  },
});
