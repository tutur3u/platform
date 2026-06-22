import { createFileRoute, redirect } from '@tanstack/react-router';
import { docsRedirectHref } from '../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/docs')({
  loader: () => {
    throw redirect({ href: docsRedirectHref(), statusCode: 307 });
  },
});
