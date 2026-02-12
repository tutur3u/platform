import TaskInitiativesPage from '@tuturuuu/ui/tu-do/initiatives/task-initiatives-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <TaskInitiativesPage params={params} />;
}
