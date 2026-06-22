import { createFileRoute, redirect } from '@tanstack/react-router';
import { meetTogetherCalendarRedirectHref } from '../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/calendar/meet-together/$')({
  loader: ({ params }) => {
    throw redirect({
      href: meetTogetherCalendarRedirectHref(params._splat),
      statusCode: 307,
    });
  },
});
