import { createFileRoute, redirect } from '@tanstack/react-router';
import {
  buildToolsRandomRedirectHref,
  type LegacySearchParams,
} from '../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/tools/random')({
  loader: ({ location }) => {
    throw redirect({
      href: buildToolsRandomRedirectHref(location.search as LegacySearchParams),
      statusCode: 307,
    });
  },
});
