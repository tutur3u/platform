import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildFinanceTransactionCategoriesRedirectHref } from '../../../../../lib/platform/redirects';

export const Route = createFileRoute(
  '/$locale/$wsId/finance/transactions/categories'
)({
  loader: ({ location, params }) => {
    throw redirect({
      href: buildFinanceTransactionCategoriesRedirectHref(params.wsId, {
        searchParams: location.searchStr,
      }),
      statusCode: 307,
    });
  },
});
