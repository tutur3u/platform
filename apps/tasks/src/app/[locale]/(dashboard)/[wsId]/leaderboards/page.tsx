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

export default function Page({ params }: Props) {
  return <TaskProgressRoute params={params} view="leaderboards" />;
}
