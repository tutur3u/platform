import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import TaskDetailServerPage from '@tuturuuu/tasks-ui/tu-do/shared/task-detail-server-page';
import type { Metadata } from 'next';
import { connection } from 'next/server';

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
  await connection();
  const user = await getSatelliteAppSessionUser('tasks');

  return (
    <TaskDetailServerPage params={params} routePrefix="" sessionUser={user} />
  );
}
