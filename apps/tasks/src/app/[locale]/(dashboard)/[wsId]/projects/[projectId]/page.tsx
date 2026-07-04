import TaskProjectDetailPage from '@tuturuuu/ui/tu-do/projects/projectId/task-project-detail-page';
import { connection } from 'next/server';

interface Props {
  params: Promise<{
    wsId: string;
    projectId: string;
  }>;
}

export default async function TaskProjectPage({ params }: Props) {
  await connection();

  return <TaskProjectDetailPage params={params} />;
}
