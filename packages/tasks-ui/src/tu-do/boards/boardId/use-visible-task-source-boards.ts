'use client';

import { useQuery } from '@tanstack/react-query';
import { listWorkspaceTaskBoards } from '@tuturuuu/internal-api/tasks';
import { useVisibleWorkspaces } from '@tuturuuu/ui/hooks/use-visible-workspaces';
import { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { useMemo } from 'react';

/** Discovery projection only: retained saved filters and task aggregation stay intact. */
export function useVisibleTaskSourceBoards(
  enabled: boolean,
  currentWorkspaceId: string,
  selectedWorkspaceIds: string[],
  selectedBoardIds: string[]
) {
  const actor = useWorkspaceActor();
  const { data: workspaces } = useVisibleWorkspaces(enabled);
  const sourceWorkspaces = useMemo(
    () =>
      [...(workspaces ?? [])].sort((a, b) => {
        if (a.id === currentWorkspaceId) return -1;
        if (b.id === currentWorkspaceId) return 1;
        return (a.name ?? '').localeCompare(b.name ?? '');
      }),
    [workspaces, currentWorkspaceId]
  );
  const selected = sourceWorkspaces.filter((workspace) =>
    selectedWorkspaceIds.includes(workspace.id)
  );
  const visibleWorkspaceIds = selected.map((workspace) => workspace.id);
  const boardsQuery = useQuery({
    queryKey: [
      'task-source-boards',
      actor?.actorId,
      selected.map(({ id, name }) => [id, name]),
    ],
    enabled: enabled && Boolean(actor) && selected.length > 0,
    queryFn: async () => {
      actor!.assertActive();
      const lists = await Promise.all(
        selected.map(async (workspace) => {
          const boards = [];
          const seen = new Set<string>();
          for (let page = 1; ; page++) {
            const response = await listWorkspaceTaskBoards(workspace.id, {
              page,
              pageSize: 100,
              status: 'active',
            });
            actor!.assertActive();
            const fresh = response.boards.filter(
              (board) => !seen.has(board.id)
            );
            if (fresh.length === 0) break;
            for (const board of fresh) seen.add(board.id);
            boards.push(...fresh);
            if (response.boards.length < 100) break;
          }
          return boards
            .filter((board) => !board.ws_id || board.ws_id === workspace.id)
            .map((board) => ({
              ...board,
              workspaceId: workspace.id,
              workspaceName: workspace.name ?? '',
            }));
        })
      );
      actor!.assertActive();
      return lists
        .flat()
        .sort(
          (a, b) =>
            a.workspaceName.localeCompare(b.workspaceName) ||
            (a.name ?? '').localeCompare(b.name ?? '')
        );
    },
    staleTime: 60_000,
  });
  const sourceBoards = (boardsQuery.data ?? []).filter((board) =>
    visibleWorkspaceIds.includes(board.workspaceId)
  );
  const visibleBoardIds = selectedBoardIds.filter((id) =>
    sourceBoards.some((board) => board.id === id)
  );
  return {
    sourceWorkspaces,
    sourceBoards,
    sourceBoardsLoading: boardsQuery.isLoading,
    visibleWorkspaceIds,
    visibleBoardIds,
  };
}
