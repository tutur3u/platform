import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildCmsRedirectHref } from '../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/epm')({
  loader: ({ params }) => {
    throw redirect({
      href: buildCmsRedirectHref(`/${params.wsId}/content`),
      statusCode: 307,
    });
  },
});
