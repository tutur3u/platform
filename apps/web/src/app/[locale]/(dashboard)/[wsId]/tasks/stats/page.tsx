import { TaskProgressRoute } from '../_components/task-progress-route';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export const metadata = {
  title: 'Task Stats',
  description: 'Review task progress totals, streaks, and daily activity.',
};

export default function Page({ params }: Props) {
  return <TaskProgressRoute params={params} view="stats" />;
}
