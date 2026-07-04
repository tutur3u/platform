import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildCmsCollectionRedirectHref } from '../../../../../lib/platform/redirects';

export const Route = createFileRoute(
  '/$locale/$wsId/epm/collections/$collectionId'
)({
  loader: ({ params }) => {
    throw redirect({
      href: buildCmsCollectionRedirectHref(params.wsId, params.collectionId),
      statusCode: 307,
    });
  },
});
