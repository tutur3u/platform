import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildCmsEntryRedirectHref } from '../../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/epm/entries/$entryId')({
  loader: ({ params }) => {
    throw redirect({
      href: buildCmsEntryRedirectHref(params.wsId, params.entryId),
      statusCode: 307,
    });
  },
});
