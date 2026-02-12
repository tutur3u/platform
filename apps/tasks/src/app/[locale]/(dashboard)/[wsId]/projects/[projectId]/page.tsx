import TaskProjectDetailPage from '@tuturuuu/ui/tu-do/projects/projectId/task-project-detail-page';

interface Props {
  params: Promise<{
    wsId: string;
    projectId: string;
  }>;
}

export default async function TaskProjectPage({ params }: Props) {
  return <TaskProjectDetailPage params={params} />;
}
