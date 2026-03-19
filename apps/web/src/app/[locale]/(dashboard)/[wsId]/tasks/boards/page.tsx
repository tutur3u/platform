import { BoardsListSkeleton } from '@tuturuuu/ui/tu-do/boards/boards-list-skeleton';
import WorkspaceProjectsClientPage from '@tuturuuu/ui/tu-do/boards/workspace-projects-client-page';
import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Boards',
  description: 'Manage Boards in the Tasks area of your Tuturuuu workspace.',
};

export default function ProjectsPage() {
  return (
    <Suspense fallback={<BoardsListSkeleton />}>
      <WorkspaceProjectsClientPage
        config={{
          showFeatureSummary: true,
          showSeparator: true,
        }}
      />
    </Suspense>
  );
}
