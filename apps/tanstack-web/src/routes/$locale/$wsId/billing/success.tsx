import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildPayBillingRedirectHref } from '../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/billing/success')({
  loader: ({ location, params }) => {
    throw redirect({
      href: buildPayBillingRedirectHref(params.wsId, {
        searchParams: location.searchStr,
        success: true,
      }),
      statusCode: 307,
    });
  },
});
