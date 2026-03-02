import { BoardsListSkeleton } from '@tuturuuu/ui/tu-do/boards/boards-list-skeleton';
import WorkspaceProjectsPage from '@tuturuuu/ui/tu-do/boards/workspace-projects-page';
import { Suspense } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function ProjectsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<BoardsListSkeleton />}>
      <WorkspaceProjectsPage params={params} searchParams={searchParams} />
    </Suspense>
  );
}
