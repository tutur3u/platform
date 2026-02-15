import { createClient } from '@tuturuuu/supabase/next/server';
import { BoardClient } from '@tuturuuu/ui/tu-do/shared/board-client';
import { getTaskBoard, getTaskLists } from '@tuturuuu/utils/task-helper';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
  /** Route prefix for tasks URLs. Defaults to '/tasks' (web app). Set to '' for satellite apps. */
  routePrefix?: string;
}

/**
 * Shared Task Board Server Page component.
 * Handles workspace resolution, authentication, and data fetching.
 * Used by both apps/web and apps/tasks.
 *
 * Tasks are NOT fetched here — they are loaded progressively per-list
 * on the client via useProgressiveBoardLoader for faster initial load.
 */
export default async function TaskBoardServerPage({
  params,
  routePrefix = '/tasks',
}: Props) {
  const { wsId: id, boardId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) notFound();

  const supabase = await createClient();

  // Fetch board and lists in parallel (fast ~100ms)
  const [board, lists] = await Promise.all([
    getTaskBoard(supabase, boardId),
    getTaskLists(supabase, boardId),
  ]);

  // If board doesn't exist, redirect to boards list page
  if (!board) {
    redirect(`/${workspace.id}${routePrefix}/boards`);
  }

  // If board exists but belongs to different workspace, show 404
  if (board.ws_id !== workspace.id) {
    notFound();
  }

  return (
    <BoardClient
      workspace={workspace}
      workspaceTier={(workspace as any)?.tier ?? null}
      initialBoard={board}
      initialLists={lists}
      currentUserId={user.id}
    />
  );
}
