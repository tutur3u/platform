import { createClient } from '@tuturuuu/supabase/next/server';
import { notFound, redirect } from 'next/navigation';
import { getTaskBoard, getTaskLists, getTasks } from '@/lib/task-helper';
import { BoardClient } from './_components/board-client';

interface Props {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

export default async function TaskBoardPage({ params }: Props) {
  const { wsId, boardId } = await params;
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
