import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildFinanceRedirectHref } from '../../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/finance/debts/$debtId')({
  loader: ({ location, params }) => {
    throw redirect({
      href: buildFinanceRedirectHref(
        params.wsId,
        `debts/${encodeURIComponent(params.debtId)}`,
        {
          searchParams: location.searchStr,
        }
      ),
      statusCode: 307,
    });
  },
});
