import { createFileRoute, redirect } from '@tanstack/react-router';
import { meetTogetherCalendarRedirectHref } from '../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/calendar/meet-together')({
  loader: () => {
    throw redirect({
      href: meetTogetherCalendarRedirectHref(),
      statusCode: 307,
    });
  },
});
