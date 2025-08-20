import TaskBoardPage from '@tuturuuu/ui/tuDo/boards/boardId/task-board-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

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
