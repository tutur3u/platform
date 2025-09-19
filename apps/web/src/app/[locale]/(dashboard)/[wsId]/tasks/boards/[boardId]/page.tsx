import TaskBoardPage from '@tuturuuu/ui/tu-do/boards/boardId/task-board-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
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

export default async function WorkspaceTaskBoardPage({ params }: Props) {
  const { wsId: id, boardId } = await params;
  const workspace = await getWorkspace(id);
  const wsId = workspace?.id;

  return <TaskBoardPage wsId={wsId} boardId={boardId} />;
}
