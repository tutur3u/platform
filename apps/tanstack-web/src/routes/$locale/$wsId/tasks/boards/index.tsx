import { createFileRoute } from '@tanstack/react-router';
import { BoardsListSkeleton } from '@tuturuuu/tasks-ui/tu-do/boards/boards-list-skeleton';
import WorkspaceProjectsClientPage from '@tuturuuu/tasks-ui/tu-do/boards/workspace-projects-client-page';
import { Suspense } from 'react';
import { requireCurrentUser } from '../../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../../lib/platform/messages';

export const Route = createFileRoute('/$locale/$wsId/tasks/boards/')({
  component: BoardsListRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Boards in the Tasks area of your Tuturuuu workspace.',
      locale,
      title: 'Boards',
    });
  },
  loader: async ({ params }) => {
    // The dashboard layout gates auth in legacy; make it explicit here so the
    // route fails closed before the client self-loads workspace/permission data.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/tasks/boards`,
    });
  },
});

function BoardsListRoutePage() {
  // WorkspaceProjectsClientPage self-loads workspace, permission and boards via
  // TanStack Query and reads `wsId` from next/navigation's useParams — which the
  // vite `next/navigation` alias maps onto TanStack Router's useParams. The
  // legacy page wrapped it in Suspense with a skeleton fallback; mirror that.
  return (
    <Suspense fallback={<BoardsListSkeleton />}>
      <WorkspaceProjectsClientPage
        config={{ showFeatureSummary: true, showSeparator: true }}
      />
    </Suspense>
  );
}
