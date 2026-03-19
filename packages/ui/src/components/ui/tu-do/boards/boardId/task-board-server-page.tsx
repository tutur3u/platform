import { BoardClient } from '@tuturuuu/ui/tu-do/shared/board-client';
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
 * Handles workspace resolution and authentication.
 * Used by both apps/web and apps/tasks.
 */
export default async function TaskBoardServerPage({
  params,
  routePrefix = '/tasks',
}: Props) {
  const { wsId: id, boardId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id, { useAdmin: true });
  if (!workspace) notFound();

  return (
    <BoardClient
      boardId={boardId}
      workspace={workspace}
      workspaceTier={(workspace as any)?.tier ?? null}
      currentUserId={user.id}
      routePrefix={routePrefix}
    />
  );
}
