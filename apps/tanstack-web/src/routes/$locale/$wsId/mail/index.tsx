import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildMailRedirectHref } from '../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/mail/')({
  loader: ({ params }) => {
    throw redirect({
      href: buildMailRedirectHref(params.wsId),
      statusCode: 307,
    });
  },
});
