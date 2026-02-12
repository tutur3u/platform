import TaskProjectDetailPage from '@tuturuuu/ui/tu-do/projects/projectId/task-project-detail-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Task Project',
  description: 'View and manage task project details.',
};

interface Props {
  params: Promise<{
    wsId: string;
    projectId: string;
  }>;
}

export default async function TaskProjectPage({ params }: Props) {
  return <TaskProjectDetailPage params={params} />;
}
