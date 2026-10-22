import {
  getWorkspaceTaskBoard,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { BoardClient } from '@tuturuuu/tasks-ui/tu-do/shared/board-client';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import type { ViewType } from '../../shared/board-views';
import { loadTaskBoardPageModel } from './task-board-page-model';

interface Props {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
  /** Route prefix for tasks URLs. Defaults to '/tasks' (web app). Set to '' for satellite apps. */
  routePrefix?: string;
  defaultView?: ViewType;
  idleBottomIsland?: ReactNode;
  rootLoading?: boolean;
  /** Verified actor supplied by satellite apps that do not use Web's Supabase session. */
  sessionUser?: { id: string };
}

async function getAuthorizedBoard(
  wsId: string,
  boardId: string,
  auth: ReturnType<typeof withForwardedInternalApiAuth>
) {
  try {
    const { board } = await getWorkspaceTaskBoard(wsId, boardId, auth);

    return board;
  } catch (error) {
    if (
      error instanceof InternalApiError &&
      (error.status === 400 ||
        error.status === 401 ||
        error.status === 403 ||
        error.status === 404)
    ) {
      return null;
    }

    throw error;
  }
}

/**
 * Shared Task Board Server Page component.
 * Handles workspace resolution and authentication.
 * Used by both apps/web and apps/tasks.
 */
export default async function TaskBoardServerPage({
  defaultView,
  idleBottomIsland,
  params,
  routePrefix = '/tasks',
  rootLoading = false,
  sessionUser,
}: Props) {
  const { wsId: id, boardId } = await params;

  const user = sessionUser ?? (await getCurrentUser());
  if (!user) redirect('/login');

  const model = await loadTaskBoardPageModel({
    boardId,
    user,
    auth: withForwardedInternalApiAuth(await headers()),
    getBoard: (_actor, auth) => getAuthorizedBoard(id, boardId, auth),
    getWorkspace: (wsId, actor) =>
      getWorkspace(wsId, { useAdmin: true, user: actor }),
  });
  if (!model) notFound();
  const { board } = model;
  const workspace =
    model.access === 'guest'
      ? { ...model.workspace, joined: false }
      : model.workspace;

  return (
    <BoardClient
      boardId={boardId}
      initialBoard={board}
      workspace={workspace}
      workspaceTier={workspace.tier ?? null}
      currentUserId={user.id}
      defaultView={defaultView}
      routePrefix={routePrefix}
      idleBottomIsland={idleBottomIsland}
      rootLoading={rootLoading}
    />
  );
}
