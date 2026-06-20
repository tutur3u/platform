import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildQrGeneratorRedirectHref } from '../lib/platform/redirects';

export const Route = createFileRoute('/qr-generator')({
  loader: ({ location }) => {
    throw redirect({
      href: buildQrGeneratorRedirectHref(location.searchStr),
      statusCode: 307,
    });
  },
});
