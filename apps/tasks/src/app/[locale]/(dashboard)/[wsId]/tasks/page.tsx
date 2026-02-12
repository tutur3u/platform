import MyTasksPage from '@tuturuuu/ui/tu-do/my-tasks/my-tasks-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <MyTasksPage params={params} />;
}
