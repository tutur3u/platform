import WorkspaceProjectsPage from '@tuturuuu/ui/tu-do/boards/workspace-projects-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

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
