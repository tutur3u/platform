import TaskLabelsPage from '@tuturuuu/ui/tu-do/labels/task-labels-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <TaskLabelsPage params={params} />;
}
