import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getTaskBoard,
  getTaskLists,
  getTasks,
} from '@tuturuuu/utils/task-helper';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { notFound, redirect } from 'next/navigation';
import { BoardClient } from '../../shared/board-client';
import type { Workspace } from '@tuturuuu/types';

interface Props {
  params: {
    wsId: string;
    boardId: string;
    workspace: Workspace;
  };
}

export default async function TaskBoardPage({ params }: Props) {
  const { wsId, boardId, workspace } = params;
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
  const currentUser = await getCurrentUser();

  return (
    <BoardClient
      workspace={workspace}
      initialBoard={board}
      initialTasks={tasks}
      initialLists={lists}
      currentUserId={currentUser?.id}
    />
  );
}
