import { createFileRoute, redirect } from '@tanstack/react-router';
import { createPageHead } from '../../lib/platform/head';
import { buildVerifyTokenRedirectHref } from '../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/verify-token')({
  head: () =>
    createPageHead({
      description: 'Access Verify Token flows for your Tuturuuu account.',
      title: 'Verify Token',
    }),
  loader: ({ location }) => {
    throw redirect({
      href: buildVerifyTokenRedirectHref(location.searchStr),
      statusCode: 307,
    });
  },
});
