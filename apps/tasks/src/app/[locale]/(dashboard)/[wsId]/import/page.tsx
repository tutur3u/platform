import { TaskProgressRoute } from '../_components/task-progress-route';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export const metadata = {
  title: 'Task Progress Import',
  description: 'Preview and import task progress entries.',
};

export default function Page({ params }: Props) {
  return <TaskProgressRoute params={params} view="import" />;
}
