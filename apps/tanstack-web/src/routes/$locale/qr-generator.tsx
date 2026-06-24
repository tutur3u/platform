import { createFileRoute, redirect } from '@tanstack/react-router';
import {
  buildQrGeneratorRedirectHref,
  type LegacySearchParams,
} from '../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/qr-generator')({
  loader: ({ location }) => {
    throw redirect({
      href: buildQrGeneratorRedirectHref(location.search as LegacySearchParams),
      statusCode: 307,
    });
  },
});
