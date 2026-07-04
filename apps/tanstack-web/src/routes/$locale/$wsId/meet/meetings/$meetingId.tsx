import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildMeetMeetingRedirectHref } from '../../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/meet/meetings/$meetingId')(
  {
    loader: ({ location, params }) => {
      throw redirect({
        href: buildMeetMeetingRedirectHref(params.wsId, params.meetingId, {
          searchParams: location.searchStr,
        }),
        statusCode: 307,
      });
    },
  }
);
