import WorkspaceProjectsPage from '@tuturuuu/ui/tu-do/boards/workspace-projects-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';

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
  const { wsId: id } = await params;
  const sp = await searchParams;
  const workspace = await getWorkspace(id);
  const wsId = workspace?.id;

  return <WorkspaceProjectsPage wsId={wsId} searchParams={sp} />;
}
