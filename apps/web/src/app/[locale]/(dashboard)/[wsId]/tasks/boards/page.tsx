import WorkspaceProjectsPage from '@tuturuuu/ui/tu-do/boards/workspace-projects-page';
import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Boards',
  description: 'Manage Boards in the Tasks area of your Tuturuuu workspace.',
};

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
    <Suspense>
      <WorkspaceProjectsPage
        params={params}
        searchParams={searchParams}
        config={{
          showFeatureSummary: true,
          showSeparator: true,
        }}
      />
    </Suspense>
  );
}
