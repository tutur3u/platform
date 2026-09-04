'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getWorkspaceTaskBoard,
  listWorkspaceTasks,
} from '@tuturuuu/internal-api/tasks';
import { useBoardRealtime } from '@tuturuuu/tasks-ui/hooks/useBoardRealtime';
import type {
  Workspace,
  WorkspaceProductTier,
  WorkspaceTaskBoard,
} from '@tuturuuu/types';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useWorkspaceLabels } from '@tuturuuu/utils/task-helper';
import { useRouter } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BoardBroadcastProvider,
  type BoardRefreshOptions,
  setActiveBoardRefresh,
  setActiveBroadcast,
} from './board-broadcast-context';
import { BoardViews, type ViewType } from './board-views';
import { ProgressiveLoaderProvider } from './progressive-loader-context';
import { dispatchRecentSidebarVisit } from './recent-sidebar-events';
import { readTaskBoardCache, writeTaskBoardCache } from './task-board-cache';
import { TaskBoardLoadingState } from './task-board-loading-state';
import { TaskCardHotkeysProvider } from './task-card-hotkeys-provider';
import { useProgressiveBoardLoader } from './use-progressive-board-loader';

const BOARD_REVALIDATE_COOLDOWN_MS = 5 * 60_000;
const RELATION_REVALIDATE_DELAY_MS = 5_000;

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
  const relationRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const cacheScopeId = currentUserId
    ? `${currentUserId}:${workspace.id}`
    : workspace.id;
  const [cachedSnapshot, setCachedSnapshot] = useState<ReturnType<
    typeof readTaskBoardCache
  > | null>(null);

  useEffect(() => {
    const snapshot = readTaskBoardCache(cacheScopeId, boardId);
    if (!snapshot) return;

    setCachedSnapshot(snapshot);
    queryClient.setQueryData(
      ['task-board', workspace.id, boardId],
      (current: WorkspaceTaskBoard | undefined) => current ?? snapshot.board
    );
    queryClient.setQueryData(
      ['tasks', boardId],
      (current: typeof snapshot.tasks | undefined) =>
        current?.length ? current : snapshot.tasks
    );
  }, [boardId, cacheScopeId, queryClient, workspace.id]);

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
    refetchOnMount: 'always',
    staleTime: 0,
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
    gcTime: 7 * 24 * 60 * 60_000,
    initialData: cachedSnapshot?.tasks ?? [],
    refetchOnMount: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!boardWorkspaceId,
  });

  // Progressive per-list loading
  const progressiveLoader = useProgressiveBoardLoader(
    boardWorkspaceId,
    boardId,
    cachedSnapshot?.pagination
  );

  useEffect(() => {
    if (!board?.id) return;
    writeTaskBoardCache(cacheScopeId, boardId, {
      board,
      pagination: progressiveLoader.pagination,
      tasks,
    });
  }, [board, boardId, cacheScopeId, progressiveLoader.pagination, tasks]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let inFlightRevalidation: Promise<void> | null = null;
    let lastSuccessfulRevalidateAt = 0;

    const revalidateLoadedLists = () => {
      const now = Date.now();
      if (
        inFlightRevalidation ||
        now - lastSuccessfulRevalidateAt < BOARD_REVALIDATE_COOLDOWN_MS
      ) {
        return;
      }

      inFlightRevalidation = progressiveLoader
        .revalidateLoadedLists()
        .then(async () => {
          lastSuccessfulRevalidateAt = Date.now();
          await queryClient.invalidateQueries({
            queryKey: ['tasks-full', boardId],
            refetchType: 'active',
          });
        })
        .catch(() => {
          // best effort
        })
        .finally(() => {
          inFlightRevalidation = null;
        });
    };

    const onFocus = () => revalidateLoadedLists();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        revalidateLoadedLists();
      }
    };
    const onOnline = () => revalidateLoadedLists();
    const onPageShow = () => revalidateLoadedLists();

    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (cachedSnapshot) revalidateLoadedLists();

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [
    boardId,
    cachedSnapshot,
    progressiveLoader.revalidateLoadedLists,
    queryClient,
  ]);

  // Fetch workspace labels once at the board level
  const { data: workspaceLabels = [] } = useWorkspaceLabels(boardWorkspaceId);

  const refreshActiveBoard = useCallback(
    async (options?: BoardRefreshOptions) => {
      const invalidateTasks = options?.invalidateTasks ?? true;
      const refreshes: Promise<unknown>[] = [];

      if (invalidateTasks) {
        refreshes.push(
          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] }),
          queryClient.invalidateQueries({ queryKey: ['tasks-full', boardId] })
        );
      }

      refreshes.push(
        progressiveLoader.revalidateLoadedLists().catch(() => {
          // Best effort: direct cache broadcasts still keep the visible board moving.
        })
      );

      if (options?.includeLists) {
        refreshes.push(
          queryClient.invalidateQueries({
            queryKey: ['task_lists', boardId],
          }),
          queryClient.invalidateQueries({
            queryKey: ['task-board', workspace.id, boardId],
          })
        );
        if (boardWorkspaceId !== workspace.id) {
          refreshes.push(
            queryClient.invalidateQueries({
              queryKey: ['task-board', boardWorkspaceId, boardId],
            })
          );
        }
      }

      await Promise.all(refreshes);
    },
    [
      boardId,
      boardWorkspaceId,
      progressiveLoader.revalidateLoadedLists,
      queryClient,
      workspace.id,
    ]
  );

  const scheduleRelationRefresh = useCallback(() => {
    if (relationRefreshTimerRef.current) {
      clearTimeout(relationRefreshTimerRef.current);
    }

    relationRefreshTimerRef.current = setTimeout(() => {
      relationRefreshTimerRef.current = null;
      void refreshActiveBoard({ invalidateTasks: false });
    }, RELATION_REVALIDATE_DELAY_MS);
  }, [refreshActiveBoard]);

  useEffect(
    () => () => {
      if (relationRefreshTimerRef.current) {
        clearTimeout(relationRefreshTimerRef.current);
      }
    },
    []
  );

  const { broadcast } = useBoardRealtime(boardId, {
    onTaskRelationsChange: scheduleRelationRefresh,
  });

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
    if (!boardError || board?.id) return;
    router.replace(`/${workspace.id}${routePrefix}/boards`);
  }, [board?.id, boardError, routePrefix, router, workspace.id]);

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
    return (
      <TaskBoardLoadingState root={rootLoading} showHeader={rootLoading} />
    );
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
        <TaskCardHotkeysProvider enabled={canManageBoard}>
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
        </TaskCardHotkeysProvider>
      </ProgressiveLoaderProvider>
    </BoardBroadcastProvider>
  );
}
