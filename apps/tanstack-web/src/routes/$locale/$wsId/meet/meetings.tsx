import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildMeetMeetingsRedirectHref } from '../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/meet/meetings')({
  loader: ({ location, params }) => {
    throw redirect({
      href: buildMeetMeetingsRedirectHref(params.wsId, {
        searchParams: location.searchStr,
      }),
      statusCode: 307,
    });
  },
});
