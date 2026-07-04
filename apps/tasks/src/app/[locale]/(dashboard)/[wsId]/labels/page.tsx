import TaskLabelsPage from '@tuturuuu/ui/tu-do/labels/task-labels-page';
import { connection } from 'next/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  await connection();

  return <TaskLabelsPage params={params} />;
}
