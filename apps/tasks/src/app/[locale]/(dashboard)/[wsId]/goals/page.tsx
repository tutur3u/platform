import { connection } from 'next/server';
import { TaskProgressRoute } from '../_components/task-progress-route';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export const metadata = {
  title: 'Task Goals',
  description: 'Manage task progress goals and habit targets.',
};

export default async function Page({ params }: Props) {
  await connection();

  return <TaskProgressRoute params={params} view="goals" />;
}
