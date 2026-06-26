'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getWorkspaceTaskBoard,
  listWorkspaceTasks,
} from '@tuturuuu/internal-api/tasks';
import type {
  Workspace,
  WorkspaceProductTier,
  WorkspaceTaskBoard,
} from '@tuturuuu/types';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useBoardRealtime } from '@tuturuuu/ui/hooks/useBoardRealtime';
import { useWorkspaceLabels } from '@tuturuuu/utils/task-helper';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo } from 'react';
import {
  BoardBroadcastProvider,
  type BoardRefreshOptions,
  setActiveBoardRefresh,
  setActiveBroadcast,
} from './board-broadcast-context';
import { BoardViews, type ViewType } from './board-views';
import { ProgressiveLoaderProvider } from './progressive-loader-context';
import { dispatchRecentSidebarVisit } from './recent-sidebar-events';
import { TaskBoardLoadingState } from './task-board-loading-state';
import { useProgressiveBoardLoader } from './use-progressive-board-loader';

const BOARD_REVALIDATE_COOLDOWN_MS = 30_000;

interface Props {
  boardId: string;
  workspace: Workspace;
  workspaceTier?: WorkspaceProductTier | null;
  currentUserId?: string;
  routePrefix?: string;
  defaultView?: ViewType;
  idleBottomIsland?: ReactNode;
  rootLoading?: boolean;
}

export function BoardClient({
  boardId,
  defaultView,
  idleBottomIsland,
  workspace,
  workspaceTier,
  currentUserId,
  routePrefix = '/tasks',
  rootLoading = false,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    data: board,
    error: boardError,
    isLoading: boardLoading,
  } = useQuery({
    queryKey: ['task-board', workspace.id, boardId],
    queryFn: async () => {
      const result = await getWorkspaceTaskBoard(workspace.id, boardId);
      return result.board as WorkspaceTaskBoard;
    },
    staleTime: 5 * 60 * 1000,
  });
  const boardWorkspaceId = board?.ws_id ?? workspace.id;
  const canManageBoard =
    (
      board as
        | (WorkspaceTaskBoard & { access_type?: 'member' | 'guest' })
        | undefined
    )?.access_type !== 'guest';
  const lists = useMemo(
    () =>
      (board as (WorkspaceTaskBoard & { task_lists?: TaskList[] }) | undefined)
        ?.task_lists ?? [],
    [board]
  );

  // Tasks start empty and are populated progressively per-list.
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', boardId],
    queryFn: async () => {
      const result = await listWorkspaceTasks(boardWorkspaceId, {
        boardId,
        includeRelationshipSummary: false,
      });
      return result.tasks;
    },
    initialData: [],
    refetchOnMount: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!boardWorkspaceId,
  });

  // Progressive per-list loading
  const progressiveLoader = useProgressiveBoardLoader(
    boardWorkspaceId,
    boardId
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isRevalidating = false;
    let lastRevalidateAt = 0;

    const revalidateLoadedLists = () => {
      const now = Date.now();
      if (
        isRevalidating ||
        now - lastRevalidateAt < BOARD_REVALIDATE_COOLDOWN_MS
      ) {
        return;
      }

      isRevalidating = true;
      lastRevalidateAt = now;
      progressiveLoader
        .revalidateLoadedLists()
        .catch(() => {
          // best effort
        })
        .finally(() => {
          isRevalidating = false;
        });
    };

    const onFocus = () => revalidateLoadedLists();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        revalidateLoadedLists();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [progressiveLoader.revalidateLoadedLists]);

  // Fetch workspace labels once at the board level
  const { data: workspaceLabels = [] } = useWorkspaceLabels(boardWorkspaceId);

  const { broadcast } = useBoardRealtime(boardId);

  const refreshActiveBoard = useCallback(
    (options?: BoardRefreshOptions) => {
      const invalidateTasks = options?.invalidateTasks ?? true;

      if (invalidateTasks) {
        void queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
        void queryClient.invalidateQueries({
          queryKey: ['tasks-full', boardId],
        });
      }

      void progressiveLoader.revalidateLoadedLists().catch(() => {
        // Best effort: direct cache broadcasts still keep the visible board moving.
      });

      if (!options?.includeLists) return;

      void queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
      void queryClient.invalidateQueries({
        queryKey: ['task-board', workspace.id, boardId],
      });
      if (boardWorkspaceId !== workspace.id) {
        void queryClient.invalidateQueries({
          queryKey: ['task-board', boardWorkspaceId, boardId],
        });
      }
    },
    [
      boardId,
      boardWorkspaceId,
      progressiveLoader.revalidateLoadedLists,
      queryClient,
      workspace.id,
    ]
  );

  // Register broadcast at module level so components outside the
  // BoardBroadcastProvider tree (e.g. task dialog) can access it.
  useEffect(() => {
    setActiveBroadcast(broadcast);
    setActiveBoardRefresh(refreshActiveBoard);
    return () => {
      setActiveBroadcast(null);
      setActiveBoardRefresh(null);
    };
  }, [broadcast, refreshActiveBoard]);

  useEffect(() => {
    queryClient.setQueryData(
      ['task_lists', boardId],
      lists.filter((list) => !list.deleted)
    );
  }, [boardId, lists, queryClient]);

  useEffect(() => {
    if (!boardError) return;
    router.replace(`/${workspace.id}${routePrefix}/boards`);
  }, [boardError, routePrefix, router, workspace.id]);

  useEffect(() => {
    if (typeof window === 'undefined' || !board?.id) return;

    const badges = [];
    const ticketPrefix = board.ticket_prefix ?? undefined;

    if (ticketPrefix) {
      badges.push({
        kind: 'ticket-prefix' as const,
        value: ticketPrefix,
      });
    }
    if (board.archived_at) {
      badges.push({ kind: 'archived' as const });
    }

    dispatchRecentSidebarVisit({
      href: window.location.pathname,
      scopeWsId: workspace.id,
      snapshot: {
        badges,
        iconKey: 'task-board',
        title: board.name || undefined,
      },
    });
  }, [
    board?.archived_at,
    board?.id,
    board?.name,
    board?.ticket_prefix,
    workspace.id,
  ]);

  if (boardLoading && !board) {
    return <TaskBoardLoadingState root={rootLoading} />;
  }

  if (!board?.id) {
    return (
      <div className="flex flex-col">
        <div className="p-4 text-center text-muted-foreground">
          Board not found
        </div>
      </div>
    );
  }

  return (
    <BoardBroadcastProvider value={broadcast}>
      <ProgressiveLoaderProvider value={progressiveLoader}>
        <BoardViews
          workspace={workspace}
          workspaceTier={workspaceTier}
          board={board}
          tasks={tasks}
          lists={lists}
          workspaceLabels={workspaceLabels}
          currentUserId={currentUserId}
          defaultView={defaultView}
          canManageBoard={canManageBoard}
          idleBottomIsland={idleBottomIsland}
        />
      </ProgressiveLoaderProvider>
    </BoardBroadcastProvider>
  );
}
