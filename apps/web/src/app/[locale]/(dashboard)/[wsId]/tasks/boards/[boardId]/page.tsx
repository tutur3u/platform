import TaskBoardPage from '@tuturuuu/ui/tu-do/boards/boardId/task-board-page';
import type { Metadata } from 'next';
import WorkspaceWrapper from '@/components/workspace-wrapper';

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
  return (
    <WorkspaceWrapper params={params}>
      {({ wsId, boardId, workspace }) => (
        <TaskBoardPage params={{ wsId, boardId, workspace }} />
      )}
    </WorkspaceWrapper>
  );
}
