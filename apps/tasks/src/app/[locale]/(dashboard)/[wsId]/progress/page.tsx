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

export default function Page({ params }: Props) {
  return <TaskProgressRoute params={params} view="progress" />;
}
