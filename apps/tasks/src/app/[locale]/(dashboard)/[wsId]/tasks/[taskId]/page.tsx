import TaskDetailServerPage from '@tuturuuu/ui/tu-do/shared/task-detail-server-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Task Details',
  description: 'View and edit task details.',
};

interface Props {
  params: Promise<{
    wsId: string;
    taskId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <TaskDetailServerPage params={params} />;
}
