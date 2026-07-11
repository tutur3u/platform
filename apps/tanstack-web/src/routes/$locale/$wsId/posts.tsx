import { createFileRoute, redirect } from '@tanstack/react-router';
import { workspaceContactsPostsRedirectHref } from '../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/posts')({
  loader: ({ location, params }) => {
    throw redirect({
      href: workspaceContactsPostsRedirectHref(params.wsId, location.searchStr),
      statusCode: 307,
    });
  },
});
