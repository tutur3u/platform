import { connection } from 'next/server';
import { TaskProgressRoute } from '../_components/task-progress-route';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export const metadata = {
  title: 'Task Leaderboards',
  description: 'Run internal task progress leaderboards and teams.',
};

export default async function Page({ params }: Props) {
  await connection();

  return <TaskProgressRoute params={params} view="leaderboards" />;
}
