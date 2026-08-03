import { createFileRoute, redirect } from '@tanstack/react-router';
import { createPageHead } from '../../lib/platform/head';
import { getPlatformAppOrigin } from '../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/login')({
  head: () =>
    createPageHead({
      description:
        'Access your Tuturuuu workspace and continue where you left off.',
      title: 'Sign In to Tuturuuu',
    }),
  loader: ({ location }) => {
    const loginUrl = new URL('/login', `${getPlatformAppOrigin()}/`);
    loginUrl.search = location.searchStr;

    throw redirect({
      href: loginUrl.toString(),
      statusCode: 307,
    });
  },
});
