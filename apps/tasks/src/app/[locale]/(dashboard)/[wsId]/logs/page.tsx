import TaskLogsPage from '@tuturuuu/ui/tu-do/logs/task-logs-page';
import { connection } from 'next/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  await connection();

  return <TaskLogsPage params={params} />;
}
