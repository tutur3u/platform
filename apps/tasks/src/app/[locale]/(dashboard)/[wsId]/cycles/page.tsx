import TaskCyclesPage from '@tuturuuu/ui/tu-do/cycles/task-cycles-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <TaskCyclesPage params={params} />;
}
