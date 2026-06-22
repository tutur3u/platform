import { createFileRoute, redirect } from '@tanstack/react-router';
import { meetTogetherProductRedirectHref } from '../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/products/meet-together')({
  loader: () => {
    throw redirect({
      href: meetTogetherProductRedirectHref(),
      statusCode: 307,
    });
  },
});
