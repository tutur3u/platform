import WorkspaceProjectsPage from '@tuturuuu/ui/tu-do/boards/workspace-projects-page';
import { createElement } from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

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
  return createElement(WorkspaceProjectsPage, { params, searchParams });
}
