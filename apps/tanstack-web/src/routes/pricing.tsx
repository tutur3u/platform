import { createFileRoute, redirect } from '@tanstack/react-router';
import { pricingRedirectHref } from '../lib/platform/redirects';

export const Route = createFileRoute('/pricing')({
  loader: () => {
    throw redirect({ href: pricingRedirectHref(), statusCode: 307 });
  },
});
