import { BoardClient } from '@tuturuuu/ui/tuDo/shared/board-client';
import { getTaskBoard, getTaskLists, getTasks } from '@tuturuuu/utils/task-helper';
import { createClient } from '@tuturuuu/supabase/next/server';
import { notFound, redirect } from 'next/navigation';

interface Props {
    wsId: string;
    boardId: string;
}

export default async function TaskBoardPage({ wsId, boardId }: Props) {
  const supabase = await createClient();

  const board = await getTaskBoard(supabase, boardId);

  // If board doesn't exist, redirect to boards list page
  if (!board) {
    redirect(`/${wsId}/tasks/boards`);
  }

  // If board exists but belongs to different workspace, show 404
  if (board.ws_id !== wsId) {
    notFound();
  }

  const tasks = await getTasks(supabase, boardId);
  const lists = await getTaskLists(supabase, boardId);

  return (
    <BoardClient
      initialBoard={board}
      initialTasks={tasks}
      initialLists={lists}
    />
  );
}
