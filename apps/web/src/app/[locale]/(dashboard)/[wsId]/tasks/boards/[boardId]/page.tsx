import { BoardClient } from './_components/board-client';
import { getTaskBoard, getTaskLists, getTasks } from '@/lib/task-helper';
import { createClient } from '@tuturuuu/supabase/next/server';
import { notFound } from 'next/navigation';

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
  const tasks = await getTasks(supabase, boardId);
  const lists = await getTaskLists(supabase, boardId);
  if (!board || board.ws_id !== wsId) notFound();

  return (
    <BoardClient
      initialBoard={board}
      initialTasks={tasks}
      initialLists={lists}
    />
  );
}
