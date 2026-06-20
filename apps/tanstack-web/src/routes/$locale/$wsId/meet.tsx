import { createFileRoute, redirect } from '@tanstack/react-router';
import { workspaceMeetPlansRedirectHref } from '../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/meet')({
  loader: ({ params }) => {
    throw redirect({
      href: workspaceMeetPlansRedirectHref(params.wsId),
      statusCode: 307,
    });
  },
});
