import {
  InternalApiError,
  listWorkspaceTaskBoards,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import {
  getUserWorkspaceConfig,
  TASK_DEFAULT_BOARD_ID_CONFIG_ID,
} from '@tuturuuu/internal-api/users';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { resolveTaskBoardEntryTarget } from './task-board-entry-target';
import { TasksNoBoardClient } from './tasks-no-board-client';

type TaskBoardAccessType = 'guest' | 'member';

async function getDefaultBoardId({
  clientOptions,
  workspaceId,
}: {
  clientOptions: ReturnType<typeof withForwardedInternalApiAuth>;
  workspaceId: string;
}) {
  try {
    const config = await getUserWorkspaceConfig(
      workspaceId,
      TASK_DEFAULT_BOARD_ID_CONFIG_ID,
      clientOptions
    );

    return config.value;
  } catch (error) {
    if (
      error instanceof InternalApiError &&
      (error.status === 401 || error.status === 403 || error.status === 404)
    ) {
      return null;
    }

    throw error;
  }
}

async function getEntryWorkspace(routeWsId: string) {
  const workspace = await getWorkspace(routeWsId);
  if (!workspace) notFound();

  return workspace;
}

export async function TaskBoardEntryPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId: routeWsId } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect('/login');

  const clientOptions = withForwardedInternalApiAuth(await headers());
  const boardsPayload = await listWorkspaceTaskBoards(
    routeWsId,
    {
      page: 1,
      pageSize: 100,
      status: 'active',
    },
    clientOptions
  ).catch((error) => {
    if (
      error instanceof InternalApiError &&
      (error.status === 401 || error.status === 403 || error.status === 404)
    ) {
      notFound();
    }

    throw error;
  });
  const firstBoard = boardsPayload.boards[0];
  const boardAccessType =
    (
      boardsPayload as typeof boardsPayload & {
        access_type?: TaskBoardAccessType;
      }
    ).access_type ??
    (
      firstBoard as
        | (typeof firstBoard & { access_type?: TaskBoardAccessType })
        | undefined
    )?.access_type;
  const workspace =
    boardAccessType || firstBoard?.ws_id
      ? null
      : await getEntryWorkspace(routeWsId);
  const effectiveAccessType =
    boardAccessType ?? (workspace?.joined ? 'member' : undefined);
  const workspaceId = firstBoard?.ws_id ?? workspace?.id;
  const defaultBoardId =
    effectiveAccessType === 'member' && workspaceId
      ? await getDefaultBoardId({ clientOptions, workspaceId })
      : null;
  const target = resolveTaskBoardEntryTarget({
    accessType: effectiveAccessType,
    boards: boardsPayload.boards,
    defaultBoardId,
  });

  if (target.type === 'redirect') {
    redirect(`/${routeWsId}/tasks/boards/${target.boardId}`);
  }

  if (target.type === 'not-found') notFound();

  const createWorkspace = workspace ?? (await getEntryWorkspace(routeWsId));

  return (
    <TasksNoBoardClient
      initialView="kanban"
      routeWsId={routeWsId}
      workspaceId={createWorkspace.id}
    />
  );
}
