import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildFinanceRedirectHref } from '../../../../../lib/platform/redirects';

export const Route = createFileRoute(
  '/$locale/$wsId/finance/wallets/$walletId'
)({
  loader: ({ location, params }) => {
    throw redirect({
      href: buildFinanceRedirectHref(
        params.wsId,
        `wallets/${encodeURIComponent(params.walletId)}`,
        {
          searchParams: location.searchStr,
        }
      ),
      statusCode: 307,
    });
  },
});
