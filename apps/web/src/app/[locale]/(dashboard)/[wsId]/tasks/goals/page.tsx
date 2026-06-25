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

export default function Page({ params }: Props) {
  return <TaskProgressRoute params={params} view="goals" />;
}
