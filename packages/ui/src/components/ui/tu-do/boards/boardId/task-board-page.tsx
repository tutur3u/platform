import { createClient } from '@tuturuuu/supabase/next/server';
import { getTaskBoard, getTaskLists } from '@tuturuuu/utils/task-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import { BoardClient } from '../../shared/board-client';

interface Props {
  wsId: string;
  boardId: string;
}

export default async function TaskBoardPage({ wsId, boardId }: Props) {
  const supabase = await createClient();

  const workspace = await getWorkspace(wsId);
  const board = await getTaskBoard(supabase, boardId);

  // If board doesn't exist, redirect to boards list page
  if (!board) {
    redirect(`/${wsId}/tasks/boards`);
  }

  // If board exists but belongs to different workspace, show 404
  if (board.ws_id !== wsId) {
    notFound();
  }

  // Do NOT fetch all tasks here – rely on per-list lazy loading
  const lists = await getTaskLists(supabase, boardId);

  return (
    <BoardClient
      workspace={workspace}
      initialBoard={board}
      initialTasks={[]}
      initialLists={lists}
      disableTasksQuery
    />
  );
}
