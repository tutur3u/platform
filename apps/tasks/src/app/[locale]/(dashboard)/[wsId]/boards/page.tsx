import WorkspaceProjectsPage from '@tuturuuu/ui/tu-do/boards/workspace-projects-page';
import { connection } from 'next/server';
import { createElement } from 'react';

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
  await connection();

  return createElement(WorkspaceProjectsPage, { params, searchParams });
}
