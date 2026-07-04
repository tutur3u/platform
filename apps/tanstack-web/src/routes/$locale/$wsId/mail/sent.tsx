import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildMailRedirectHref } from '../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/mail/sent')({
  loader: ({ params }) => {
    throw redirect({
      href: buildMailRedirectHref(params.wsId, { folder: 'sent' }),
      statusCode: 307,
    });
  },
});
