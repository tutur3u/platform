import TaskInitiativesPage from '@tuturuuu/ui/tu-do/initiatives/task-initiatives-page';
import { connection } from 'next/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  await connection();

  return <TaskInitiativesPage params={params} />;
}
