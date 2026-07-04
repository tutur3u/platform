import { createFileRoute, redirect } from '@tanstack/react-router';
import { pricingRedirectHref } from '../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/pricing')({
  loader: () => {
    throw redirect({
      href: pricingRedirectHref({ localized: true }),
      statusCode: 307,
    });
  },
});
