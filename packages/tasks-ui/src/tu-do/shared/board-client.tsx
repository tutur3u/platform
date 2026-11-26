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
import { getUserWorkspaceConfigQueryKey } from '@tuturuuu/ui/hooks/use-user-workspace-config';
import { useWorkspaceLabels } from '@tuturuuu/utils/task-helper';
import { useRouter } from 'next/navigation';
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
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
import {
  BOARD_USER_CONFIG_DEFAULTS,
  BOARD_WORKSPACE_CONFIG_IDS,
  type BoardPreferenceSeed,
} from './board-preference-seed';
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
import {
  type BoardFirstListPage,
  seedFromFirstListPages,
  useProgressiveBoardLoader,
} from './use-progressive-board-loader';

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

type SeedEntry = { key: readonly unknown[]; data: unknown };

/** The preference queries the kanban waits for before its first paint. */
function preferenceSeedEntries(
  workspaceId: string,
  seed: BoardPreferenceSeed
): SeedEntry[] {
  const entries: SeedEntry[] = [];
  for (const [configId, fallback] of Object.entries(
    BOARD_USER_CONFIG_DEFAULTS
  )) {
    if (!Object.hasOwn(seed.userConfigs, configId)) continue;
    entries.push({
      key: ['user-config', configId],
      data: seed.userConfigs[configId] ?? fallback,
    });
  }
  for (const configId of BOARD_WORKSPACE_CONFIG_IDS) {
    if (!Object.hasOwn(seed.workspaceConfigs, configId)) continue;
    entries.push({
      key: getUserWorkspaceConfigQueryKey(workspaceId, configId),
      data: seed.workspaceConfigs[configId] ?? null,
    });
  }
  return entries;
}

/**
 * Whether a server copy read at `snapshotAt` is newer than the cached query.
 * A preloaded or back-navigated page model can be older than edits made in
 * this tab since, and must not replace them.
 */
function isServerCopyNewer(
  queryClient: ReturnType<typeof useQueryClient>,
  key: readonly unknown[],
  snapshotAt: number
) {
  const state = queryClient.getQueryState(key);
  return state?.data === undefined || state.dataUpdatedAt < snapshotAt;
}

export function BoardClient({
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
  // Server-read pages and preferences replace older cached copies, so the
  // columns skip their initial browser request. Rendering only creates
  // queries absent from the cache; replacing an older cached copy waits for
  // the layout effects below, before paint.
  const boardWorkspaceKey = initialBoard?.ws_id ?? workspace.id;
  const preferenceSeed = useMemo(
    () =>
      initialBoard?.id === boardId && initialPreferences
        ? {
            entries: preferenceSeedEntries(
              boardWorkspaceKey,
              initialPreferences
            ),
            snapshotAt: initialSnapshotAt,
          }
        : null,
    [
      boardId,
      boardWorkspaceKey,
      initialBoard?.id,
      initialPreferences,
      initialSnapshotAt,
    ]
  );
  // Task pages seed once per mount, paired with the time they were read: a
  // later reload of the same board leaves the live cache (realtime, loaded
  // pages, local edits) alone.
  const [serverSeed] = useState(() => {
    for (const { key, data } of preferenceSeed?.entries ?? []) {
      if (queryClient.getQueryState(key) !== undefined) continue;
      queryClient.setQueryData(key, data, {
        updatedAt: preferenceSeed?.snapshotAt,
      });
    }
    if (initialBoard?.id !== boardId || !initialListPages) return null;
    return {
      boardId,
      snapshotAt: initialSnapshotAt,
      tasks: isServerCopyNewer(
        queryClient,
        ['tasks', boardId],
        initialSnapshotAt
      )
        ? seedFromFirstListPages(initialListPages)
        : null,
    };
  });
  useLayoutEffect(() => {
    if (!preferenceSeed) return;
    for (const { key, data } of preferenceSeed.entries) {
      if (isServerCopyNewer(queryClient, key, preferenceSeed.snapshotAt))
        queryClient.setQueryData(key, data, {
          updatedAt: preferenceSeed.snapshotAt,
        });
    }
  }, [preferenceSeed, queryClient]);
  useLayoutEffect(() => {
    if (!serverSeed?.tasks) return;
    const tasksKey = ['tasks', serverSeed.boardId];
    if (isServerCopyNewer(queryClient, tasksKey, serverSeed.snapshotAt)) {
      queryClient.setQueryData(tasksKey, serverSeed.tasks.tasks, {
        updatedAt: serverSeed.snapshotAt,
      });
    }
  }, [queryClient, serverSeed]);
  // The seed belongs to the board it was read for, even if a caller reuses
  // this instance for another board.
  const boardSeed = serverSeed?.boardId === boardId ? serverSeed : null;

  useEffect(() => {
    // A shared browser keeps only the signed-in user's board snapshots.
    bindTaskBoardCacheSessionEnd();
    if (currentUserId) purgeOtherUserTaskBoardCaches(currentUserId);
    // Server pages were either seeded or skipped for a newer live cache; the
    // browser copy is older than both.
    if (boardSeed) return;
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
    boardSeed,
    workspace.id,
  ]);

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
    // The server already authorized this exact board for the current request.
    // Reuse it through hydration instead of paying for the same API read twice.
    initialData:
      initialBoard?.id === boardId && initialBoard.ws_id === workspace.id
        ? initialBoard
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
    boardSeed?.tasks?.pagination ?? cachedSnapshot?.pagination
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
    initialData: boardSeed?.tasks?.tasks ?? cachedSnapshot?.tasks ?? [],
    initialDataUpdatedAt: boardSeed?.tasks ? boardSeed.snapshotAt : undefined,
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
