import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildMindRedirectHref } from '../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/mind')({
  loader: ({ location, params }) => {
    throw redirect({
      href: buildMindRedirectHref(params.wsId, {
        searchParams: location.searchStr,
      }),
      statusCode: 307,
    });
  },
});
