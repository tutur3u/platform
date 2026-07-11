import { createFileRoute, redirect } from '@tanstack/react-router';
import { workspaceChatRedirectHref } from '../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/chat')({
  loader: ({ params }) => {
    throw redirect({
      href: workspaceChatRedirectHref(params.wsId),
      statusCode: 307,
    });
  },
});
