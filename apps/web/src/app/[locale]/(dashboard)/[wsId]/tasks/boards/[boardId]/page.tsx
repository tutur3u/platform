import TaskBoardServerPage from '@tuturuuu/ui/tu-do/boards/boardId/task-board-server-page';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Board Details',
  description:
    'Manage Board Details in the Boards area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const resolvedParams = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect('/login');

  return <TaskBoardServerPage params={Promise.resolve(resolvedParams)} />;
}
