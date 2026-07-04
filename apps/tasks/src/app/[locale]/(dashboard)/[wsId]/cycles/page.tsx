import TaskCyclesPage from '@tuturuuu/ui/tu-do/cycles/task-cycles-page';
import { connection } from 'next/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  await connection();

  return <TaskCyclesPage params={params} />;
}
