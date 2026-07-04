import { connection } from 'next/server';
import { TaskProgressRoute } from '../_components/task-progress-route';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export const metadata = {
  title: 'Task Progress',
  description: 'Track task progress entries, metrics, and recent activity.',
};

export default async function Page({ params }: Props) {
  await connection();

  return <TaskProgressRoute params={params} view="progress" />;
}
