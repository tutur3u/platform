import TaskEstimatesPage from '@tuturuuu/ui/tu-do/estimates/task-estimates-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <TaskEstimatesPage params={params} />;
}
