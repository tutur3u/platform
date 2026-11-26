'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getWorkspaceTaskBoard } from '@tuturuuu/internal-api/tasks';
import { useBoardRealtime } from '@tuturuuu/tasks-ui/hooks/useBoardRealtime';
import type {
  Workspace,
  WorkspaceProductTier,
  WorkspaceTaskBoard,
} from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useWorkspaceLabels } from '@tuturuuu/utils/task-helper';
import { useRouter } from 'next/navigation';
import {
  lazy,
  type ReactNode,
  Suspense,
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
import type { BoardPreferenceSeed } from './board-preference-seed';
import { getBoardSprintsQueryKey } from './board-sprints/use-board-sprints';
import { BoardViews, type ViewType } from './board-views';
import { ProgressiveLoaderProvider } from './progressive-loader-context';
import { dispatchRecentSidebarVisit } from './recent-sidebar-events';
import {
  purgeOtherUserTaskBoardCaches,
  readTaskBoardCache,
} from './task-board-cache';
import {
  bindTaskBoardCacheSessionEnd,
  flushTaskBoardCacheWrite,
  scheduleTaskBoardCacheWrite,
} from './task-board-cache-scheduler';
import { TaskBoardLoadingState } from './task-board-loading-state';
import { TaskCardHotkeysProvider } from './task-card-hotkeys-provider';
import { useBoardServerSeed } from './use-board-server-seed';
import type { BoardFirstListPage } from './board-first-page';
import { useProgressiveBoardLoader } from './use-progressive-board-loader';

// Pilot (default off): TanStack DB board sync ships in its own chunk so boards
// without the flag never download it.
const InstantBoardViews = lazy(
  () => import('../instant-sync/instant-board-views')
);

// Coalesce paired focus/visibility events without suppressing the next tab visit.
const BOARD_REVALIDATE_COOLDOWN_MS = 1_000;
const RELATION_REVALIDATE_DELAY_MS = 5_000;

interface Props {
  boardId: string;
  initialBoard?: WorkspaceTaskBoard;
  /** First task page per list, read with `initialBoard` during the server render. */
  initialListPages?: Record<string, BoardFirstListPage>;
  /** Board preferences read with `initialBoard` during the server render. */
  initialPreferences?: BoardPreferenceSeed;
  /** Server time (ms) the initial pages and preferences were read at. */
  initialSnapshotAt?: number;
  workspace: Pick<Workspace, 'id' | 'personal'>;
  workspaceTier?: WorkspaceProductTier | null;
  currentUserId?: string;
  routePrefix?: string;
  defaultView?: ViewType;
  idleBottomIsland?: ReactNode;
  rootLoading?: boolean;
  /** Pilot: read and write board tasks through TanStack DB (default off). */
  instantSyncEnabled?: boolean;
}

/**
 * One mounted body per user, workspace and board, so board-scoped state (the
 * server seed, the browser copy, per-list pagination) never carries over when
 * a caller reuses the component for another board.
 */
export function BoardClient(props: Props) {
  return (
    <BoardClientBody
      key={`${props.currentUserId ?? ''}:${props.workspace.id}:${props.boardId}`}
      {...props}
    />
  );
}

function BoardClientBody({
  boardId,
  initialBoard,
  initialListPages,
  initialPreferences,
  initialSnapshotAt = 0,
  defaultView,
  idleBottomIsland,
  workspace,
  workspaceTier,
  currentUserId,
  routePrefix = '/tasks',
  rootLoading = false,
  instantSyncEnabled = false,
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
  const boardQueryKey = useMemo(
    () => ['task-board', workspace.id, boardId] as const,
    [boardId, workspace.id]
  );
  const initialBoardForQuery =
    initialBoard?.id === boardId && initialBoard.ws_id === workspace.id
      ? initialBoard
      : undefined;
  // Server-read board, first pages and preferences replace older cached
  // copies, so the columns skip their initial browser request.
  const seed = useBoardServerSeed({
    boardId,
    boardQueryKey,
    seedBoardQuery: initialBoardForQuery !== undefined,
    initialBoard,
    initialListPages,
    initialPreferences,
    snapshotAt: initialSnapshotAt,
  });

  useEffect(() => {
    // A shared browser keeps only the signed-in user's board snapshots.
    bindTaskBoardCacheSessionEnd();
    if (currentUserId) purgeOtherUserTaskBoardCaches(currentUserId);
    // Server pages were either seeded or skipped for a newer live cache; the
    // browser copy is older than both.
    if (seed.hasServerPages) return;
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
  }, [
    boardId,
    cacheScopeId,
    currentUserId,
    queryClient,
    seed.hasServerPages,
    workspace.id,
  ]);

  const {
    data: board,
    error: boardError,
    isLoading: boardLoading,
  } = useQuery({
    queryKey: boardQueryKey,
    queryFn: async () => {
      const result = await getWorkspaceTaskBoard(workspace.id, boardId);
      return result.board as WorkspaceTaskBoard;
    },
    // The server already authorized this exact board for the current request.
    // Reuse it through hydration instead of paying for the same API read twice.
    initialData: initialBoardForQuery,
    initialDataUpdatedAt:
      initialBoardForQuery && initialSnapshotAt > 0
        ? initialSnapshotAt
        : undefined,
    refetchOnMount: true,
    staleTime: initialBoard ? 30_000 : 0,
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

  // Progressive per-list loading
  const progressiveLoader = useProgressiveBoardLoader(
    boardWorkspaceId,
    boardId,
    seed.pagination ?? cachedSnapshot?.pagination
  );

  // Tasks start empty and are populated progressively per-list.
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', boardId],
    queryFn: async () => {
      // This cache contains multiple independently paginated lists. A board-wide
      // request returns only one page and must never replace the accumulated data.
      await progressiveLoader.revalidateLoadedLists();
      return queryClient.getQueryData<Task[]>(['tasks', boardId]) ?? [];
    },
    gcTime: 7 * 24 * 60 * 60_000,
    initialData: seed.initialTasks ?? cachedSnapshot?.tasks ?? [],
    initialDataUpdatedAt: seed.initialTasksUpdatedAt,
    refetchOnMount: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!boardWorkspaceId,
  });

  useEffect(() => {
    if (!board?.id) return;
    scheduleTaskBoardCacheWrite(cacheScopeId, boardId, {
      board,
      pagination: progressiveLoader.pagination,
      tasks,
    });
  }, [board, boardId, cacheScopeId, progressiveLoader.pagination, tasks]);
  useEffect(
    () => () => flushTaskBoardCacheWrite(cacheScopeId, boardId),
    [boardId, cacheScopeId]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let inFlightRevalidation: Promise<void> | null = null;
    let lastSuccessfulRevalidateAt = Number.NEGATIVE_INFINITY;

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
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: ['tasks-full', boardId],
              refetchType: 'active',
            }),
            queryClient.invalidateQueries({
              queryKey: ['task-board', workspace.id, boardId],
              refetchType: 'active',
            }),
          ]);
        })
        .catch(() => {
          // best effort
        })
        .finally(() => {
          inFlightRevalidation = null;
        });
    };

    const onFocus = () => {
      if (document.visibilityState === 'visible') revalidateLoadedLists();
    };
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
    if (cachedSnapshot || seed.revalidateOnMount) revalidateLoadedLists();

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
    seed.revalidateOnMount,
    workspace.id,
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
          queryClient.invalidateQueries({ queryKey: ['tasks-full', boardId] }),
          queryClient.invalidateQueries({
            queryKey: getBoardSprintsQueryKey(boardId),
          })
        );
      }

      if (!invalidateTasks) {
        refreshes.push(
          progressiveLoader.revalidateLoadedLists().catch(() => {
            // Relation broadcasts remain usable while the network is unavailable.
          })
        );
      }

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

  const boardViewsProps = {
    workspace,
    workspaceTier,
    board,
    lists,
    workspaceLabels,
    currentUserId,
    defaultView,
    canManageBoard,
    idleBottomIsland,
  };

  return (
    <BoardBroadcastProvider value={broadcast}>
      <ProgressiveLoaderProvider value={progressiveLoader}>
        <TaskCardHotkeysProvider enabled={canManageBoard}>
          {instantSyncEnabled ? (
            <Suspense
              fallback={
                <TaskBoardLoadingState
                  root={rootLoading}
                  showHeader={rootLoading}
                />
              }
            >
              <InstantBoardViews
                key={boardId}
                {...boardViewsProps}
                boardId={boardId}
                wsId={boardWorkspaceId}
              />
            </Suspense>
          ) : (
            <BoardViews {...boardViewsProps} tasks={tasks} />
          )}
        </TaskCardHotkeysProvider>
      </ProgressiveLoaderProvider>
    </BoardBroadcastProvider>
  );
}
