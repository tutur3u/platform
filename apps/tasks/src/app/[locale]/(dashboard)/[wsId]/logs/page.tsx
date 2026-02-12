import TaskLogsPage from '@tuturuuu/ui/tu-do/logs/task-logs-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <TaskLogsPage params={params} />;
}
