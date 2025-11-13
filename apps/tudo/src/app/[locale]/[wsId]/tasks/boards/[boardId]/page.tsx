import TaskBoardPage from '@tuturuuu/ui/tu-do/boards/boardId/task-board-page';
import { Suspense } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

export default async function WorkspaceTaskBoardPage({ params }: Props) {
  return (
    <Suspense>
      <TaskBoardPage params={params} />
    </Suspense>
  );
}
