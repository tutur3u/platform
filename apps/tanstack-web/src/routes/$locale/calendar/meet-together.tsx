import { createFileRoute, redirect } from '@tanstack/react-router';
import { normalizePathname } from '../../../lib/platform/locale';
import { meetTogetherCalendarRedirectHref } from '../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/calendar/meet-together')({
  loader: ({ location, params }) => {
    const routePath = `/${params.locale}/calendar/meet-together`;

    if (normalizePathname(location.pathname) !== routePath) {
      return null;
    }

    throw redirect({
      href: meetTogetherCalendarRedirectHref(),
      statusCode: 307,
    });
  },
});
