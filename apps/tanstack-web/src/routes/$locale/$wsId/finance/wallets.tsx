import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildFinanceRedirectHref } from '../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/finance/wallets')({
  loader: ({ location, params }) => {
    throw redirect({
      href: buildFinanceRedirectHref(params.wsId, 'wallets', {
        searchParams: location.searchStr,
      }),
      statusCode: 307,
    });
  },
});
