import TaskBoardServerPage from '@tuturuuu/ui/tu-do/boards/boardId/task-board-server-page';
import type { Metadata } from 'next';

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
  return <TaskBoardServerPage params={params} />;
}
