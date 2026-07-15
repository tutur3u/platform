import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { getWorkspaceTaskBoard } from '@tuturuuu/internal-api/tasks';
import { BoardClient } from '@tuturuuu/tasks-ui/tu-do/shared/board-client';
import type { Workspace, WorkspaceProductTier } from '@tuturuuu/types';
import { requireCurrentUser } from '../../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../../lib/platform/messages';
import { resolveFullWorkspace } from '../../../../../lib/platform/workspace';

type AuthorizedBoard = Awaited<
  ReturnType<typeof getWorkspaceTaskBoard>
>['board'] & {
  access_type?: 'member' | 'guest';
};

type BoardDetailLoaderData = {
  boardId: string;
  currentUserId: string;
  workspace: Workspace;
  workspaceTier: WorkspaceProductTier | null;
};

function createGuestBoardWorkspace(wsId: string): Workspace {
  return {
    avatar_url: null,
    created_at: null,
    creator_id: '',
    deleted: null,
    energy_profile: null,
    first_day_of_week: null,
    handle: null,
    id: wsId,
    logo_url: null,
    name: null,
    personal: false,
    scheduling_settings: null,
    timezone: null,
  };
}

const loadAuthorizedBoard = createServerFn({ method: 'GET' })
  .validator((data: { wsId: string; boardId: string }) => data)
  .handler(async ({ data }): Promise<AuthorizedBoard | null> => {
    try {
      const { board } = await getWorkspaceTaskBoard(
        data.wsId,
        data.boardId,
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return board as AuthorizedBoard;
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
  });

export const Route = createFileRoute('/$locale/$wsId/tasks/boards/$boardId')({
  component: BoardDetailRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Board Details in the Boards area of your Tuturuuu workspace.',
      locale,
      title: 'Board Details',
    });
  },
  loader: async ({ params }): Promise<BoardDetailLoaderData> => {
    // Auth gate FIRST, fail closed: legacy getCurrentUser() -> redirect('/login').
    const user = await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/tasks/boards/${params.boardId}`,
    });

    // The legacy shared server page authorizes through the task-board internal
    // API and maps 400/401/403/404 to notFound().
    const board = await loadAuthorizedBoard({
      data: { wsId: params.wsId, boardId: params.boardId },
    });
    if (!board?.id) {
      throw notFound();
    }

    // Member access uses the board's canonical workspace id, matching the
    // legacy server page's `getWorkspace(board.ws_id)` after authorization.
    // Guest board access intentionally uses a minimal workspace shell; the
    // shared legacy component does the same and BoardClient loads board state
    // from the authorized internal-api endpoint.
    if (board.access_type !== 'guest') {
      const workspace = await resolveFullWorkspace({
        data: { wsId: board.ws_id },
      });

      if (!workspace.exists) {
        throw notFound();
      }

      return {
        boardId: params.boardId,
        currentUserId: user.id,
        workspace: workspace.workspace,
        workspaceTier: null,
      };
    }

    return {
      boardId: params.boardId,
      currentUserId: user.id,
      workspace: createGuestBoardWorkspace(board.ws_id),
      workspaceTier: null,
    };
  },
});

function BoardDetailRoutePage() {
  const data = Route.useLoaderData() as BoardDetailLoaderData | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <BoardClient
      boardId={data.boardId}
      currentUserId={data.currentUserId}
      routePrefix="/tasks"
      workspace={data.workspace}
      workspaceTier={data.workspaceTier}
    />
  );
}
