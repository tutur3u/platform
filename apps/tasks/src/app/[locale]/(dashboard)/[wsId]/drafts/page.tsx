import TaskDraftsPage from '@tuturuuu/ui/tu-do/drafts/task-drafts-page';
import { connection } from 'next/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  await connection();

  return <TaskDraftsPage params={params} />;
}
