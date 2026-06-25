import {
  getWorkspaceTaskBoard,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type {
  Workspace,
  WorkspaceProductTier,
  WorkspaceTaskBoard,
} from '@tuturuuu/types';
import { BoardClient } from '@tuturuuu/ui/tu-do/shared/board-client';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
  /** Route prefix for tasks URLs. Defaults to '/tasks' (web app). Set to '' for satellite apps. */
  routePrefix?: string;
  idleBottomIsland?: ReactNode;
  rootLoading?: boolean;
}

type AuthorizedWorkspace = Workspace & {
  joined: boolean;
  tier: WorkspaceProductTier | null;
};

function createBoardGuestWorkspace(wsId: string): AuthorizedWorkspace {
  return {
    id: wsId,
    joined: false,
    personal: false,
    tier: null,
  } as AuthorizedWorkspace;
}

async function getAuthorizedBoard(wsId: string, boardId: string) {
  try {
    const { board } = await getWorkspaceTaskBoard(
      wsId,
      boardId,
      withForwardedInternalApiAuth(await headers())
    );

    return board as WorkspaceTaskBoard & {
      access_type?: 'member' | 'guest';
    };
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
  idleBottomIsland,
  params,
  routePrefix = '/tasks',
  rootLoading = false,
}: Props) {
  const { wsId: id, boardId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const board = await getAuthorizedBoard(id, boardId);
  if (!board?.id) notFound();

  const isMemberBoardAccess = board.access_type === 'member';
  const workspace = isMemberBoardAccess
    ? await getWorkspace(board.ws_id, { useAdmin: true })
    : createBoardGuestWorkspace(board.ws_id);
  if (!workspace) notFound();

  return (
    <BoardClient
      boardId={boardId}
      workspace={workspace}
      workspaceTier={workspace.tier ?? null}
      currentUserId={user.id}
      routePrefix={routePrefix}
      idleBottomIsland={idleBottomIsland}
      rootLoading={rootLoading}
    />
  );
}
