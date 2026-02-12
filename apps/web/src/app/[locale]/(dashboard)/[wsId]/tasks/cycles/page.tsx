import TaskCyclesPage from '@tuturuuu/ui/tu-do/cycles/task-cycles-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Task Cycles',
  description: 'Plan and track time-boxed sprints for tasks.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <TaskCyclesPage params={params} />;
}
