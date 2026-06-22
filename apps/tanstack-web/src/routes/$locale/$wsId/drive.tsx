import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildDriveRedirectHref } from '../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/drive')({
  loader: ({ location, params }) => {
    throw redirect({
      href: buildDriveRedirectHref(params.wsId, {
        searchParams: location.searchStr,
      }),
      statusCode: 307,
    });
  },
});
