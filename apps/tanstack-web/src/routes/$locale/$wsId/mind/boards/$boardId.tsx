import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildMindBoardRedirectHref } from '../../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/mind/boards/$boardId')({
  loader: ({ location, params }) => {
    throw redirect({
      href: buildMindBoardRedirectHref(params.wsId, params.boardId, {
        searchParams: location.searchStr,
      }),
      statusCode: 307,
    });
  },
});
