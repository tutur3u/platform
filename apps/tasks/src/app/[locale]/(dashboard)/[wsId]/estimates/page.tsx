import TaskEstimatesPage from '@tuturuuu/ui/tu-do/estimates/task-estimates-page';
import { connection } from 'next/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  await connection();

  return <TaskEstimatesPage params={params} />;
}
