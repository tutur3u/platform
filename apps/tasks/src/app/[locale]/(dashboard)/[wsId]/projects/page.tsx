import TaskProjectsPage from '@tuturuuu/ui/tu-do/projects/task-projects-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <TaskProjectsPage params={params} />;
}
