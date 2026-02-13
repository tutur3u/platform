import { createClient } from '@tuturuuu/supabase/next/server';
import type { Workspace, WorkspaceProductTier } from '@tuturuuu/types';
import {
  getTaskBoard,
  getTaskLists,
  getTasks,
} from '@tuturuuu/utils/task-helper';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import { BoardClient } from '../../shared/board-client';

interface Props {
  params: {
    wsId: string;
    boardId: string;
    workspace?: Workspace & { tier?: WorkspaceProductTier | null };
  };
}

export default async function TaskBoardPage({ params }: Props) {
  const { wsId, boardId, workspace } = params;

  const supabase = await createClient();

  let resolvedWorkspace = workspace ?? null;
  if (!resolvedWorkspace) {
    resolvedWorkspace = await getWorkspace(wsId);
  }
  if (!resolvedWorkspace) {
    notFound();
  }

  const board = await getTaskBoard(supabase, boardId);

  // If board doesn't exist, redirect to boards list page
  if (!board) {
    redirect(`/${wsId}/tasks/boards`);
  }

  // If board exists but belongs to different workspace, show 404
  if (board.ws_id !== resolvedWorkspace.id) {
    notFound();
  }

  const tasks = await getTasks(supabase, boardId);
  const lists = await getTaskLists(supabase, boardId);
  const currentUser = await getCurrentUser();

  return (
    <BoardClient
      workspace={resolvedWorkspace}
      workspaceTier={(resolvedWorkspace as any)?.tier ?? null}
      initialBoard={board}
      initialTasks={tasks}
      initialLists={lists}
      currentUserId={currentUser?.id}
    />
  );
}
