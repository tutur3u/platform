import { createClient } from '@tuturuuu/supabase/next/server';
import { BoardClient } from '@tuturuuu/ui/tu-do/shared/board-client';
import {
  getTaskBoard,
  getTaskLists,
  getTasks,
} from '@tuturuuu/utils/task-helper';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

/**
 * Shared Task Board Server Page component.
 * Handles workspace resolution, authentication, and data fetching.
 * Used by both apps/web and apps/tasks.
 */
export default async function TaskBoardServerPage({ params }: Props) {
  const { wsId: id, boardId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) redirect('/');

  const supabase = await createClient();
  const board = await getTaskBoard(supabase, boardId);

  // If board doesn't exist, redirect to boards list page
  if (!board) {
    redirect(`/${workspace.id}/tasks/boards`);
  }

  // If board exists but belongs to different workspace, show 404
  if (board.ws_id !== workspace.id) {
    notFound();
  }

  const tasks = await getTasks(supabase, boardId);
  const lists = await getTaskLists(supabase, boardId);

  return (
    <BoardClient
      workspace={workspace}
      workspaceTier={(workspace as any)?.tier ?? null}
      initialBoard={board}
      initialTasks={tasks}
      initialLists={lists}
      currentUserId={user.id}
    />
  );
}
