import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildMeetPlansRedirectHref } from '../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/meet/plans')({
  loader: ({ location, params }) => {
    throw redirect({
      href: buildMeetPlansRedirectHref(params.wsId, {
        searchParams: location.searchStr,
      }),
      statusCode: 307,
    });
  },
});
