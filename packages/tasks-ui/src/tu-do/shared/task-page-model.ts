import 'server-only';
import { dehydrate, QueryClient } from '@tanstack/react-query';
import {
  getWorkspaceBoardsData,
  getWorkspaceTaskBoard,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { loadTaskBoardPageModel } from '@tuturuuu/tasks-ui/tu-do/boards/boardId/task-board-page-model';
import { boardsTransportState } from './boards-transport';

export function createTaskPageModel({
  headers,
  notFound,
  redirect,
  getPermissions,
  getWorkspace,
}: {
  headers: () => Promise<Headers>;
  notFound: () => never;
  redirect: (href: string) => never;
  getPermissions: typeof import('@tuturuuu/utils/workspace-helper').getPermissions;
  getWorkspace: typeof import('@tuturuuu/utils/workspace-helper').getWorkspace;
}) {
  return async function taskPageModel({
    segments,
    workspace,
    user,
    search,
  }: {
    segments: string[];
    workspace: NonNullable<Awaited<ReturnType<typeof getWorkspace>>>;
    user: { id: string };
    search: URLSearchParams;
  }) {
    const wsId = workspace.id;
    if (segments.length === 1)
      return {
        kind: 'tasks' as const,
        wsId,
        userId: user.id,
        personal: !!workspace.personal,
      };
    if (segments[1] !== 'boards' && segments.length === 2)
      return { kind: 'task-detail' as const, wsId, taskId: segments[1] ?? '' };
    if (segments[1] !== 'boards') return notFound();
    if (segments.length === 3) {
      const boardId = segments[2];
      if (!boardId) return notFound();
      const snapshot = await loadTaskBoardPageModel({
        boardId,
        user,
        auth: withForwardedInternalApiAuth(await headers()),
        getBoard: async (_actor, auth) => {
          try {
            const { board } = await getWorkspaceTaskBoard(wsId, boardId, auth);
            return board;
          } catch (error) {
            if (
              error instanceof InternalApiError &&
              [400, 401, 403, 404].includes(error.status)
            )
              return null;
            throw error;
          }
        },
        getWorkspace: (id, actor) =>
          getWorkspace(id, { useAdmin: true, user: actor }),
      });
      if (!snapshot) return notFound();
      return { kind: 'board' as const, ...snapshot, userId: user.id };
    }
    if (segments.length !== 2) return notFound();
    const permissions = await getPermissions({ wsId, user });
    if (!permissions) return notFound();
    if (permissions.withoutPermission('manage_projects')) redirect(`/${wsId}`);
    const q = search.get('q') || '';
    const page = search.get('page') || '1';
    const pageSize = search.get('pageSize') || '10';
    const initialBoards = await getWorkspaceBoardsData(
      wsId,
      {
        q,
        page: Number.parseInt(page, 10),
        pageSize: Number.parseInt(pageSize, 10),
      },
      withForwardedInternalApiAuth(await headers())
    );
    const client = new QueryClient();
    client.setQueryData(['boards', wsId, q, page, pageSize], initialBoards);
    return {
      kind: 'boards' as const,
      wsId,
      openWhenEmpty: q.trim() === '' && initialBoards.count === 0,
      state: boardsTransportState(dehydrate(client)),
    };
  };
}
export type TaskPageModel = Awaited<
  ReturnType<ReturnType<typeof createTaskPageModel>>
>;
