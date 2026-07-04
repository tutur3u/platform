import TaskProjectsPage from '@tuturuuu/ui/tu-do/projects/task-projects-page';
import { connection } from 'next/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  await connection();

  return <TaskProjectsPage params={params} />;
}
