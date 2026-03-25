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
import { useEffect, useMemo } from 'react';
import {
  BoardBroadcastProvider,
  setActiveBroadcast,
} from './board-broadcast-context';
import { BoardViews } from './board-views';
import { ProgressiveLoaderProvider } from './progressive-loader-context';
import { dispatchRecentSidebarVisit } from './recent-sidebar-events';
import { useProgressiveBoardLoader } from './use-progressive-board-loader';

interface Props {
  boardId: string;
  workspace: Workspace;
  workspaceTier?: WorkspaceProductTier | null;
  currentUserId?: string;
  routePrefix?: string;
}

export function BoardClient({
  boardId,
  workspace,
  workspaceTier,
  currentUserId,
  routePrefix = '/tasks',
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
      if (isRevalidating || now - lastRevalidateAt < 1500) return;

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

  const { broadcast } = useBoardRealtime(boardId, {
    enabled: !workspace.personal,
  });

  // Register broadcast at module level so components outside the
  // BoardBroadcastProvider tree (e.g. task dialog) can access it.
  useEffect(() => {
    setActiveBroadcast(broadcast);
    return () => setActiveBroadcast(null);
  }, [broadcast]);

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
    return (
      <div className="flex flex-col">
        <div className="p-4 text-center text-muted-foreground">
          Loading board...
        </div>
      </div>
    );
  }

  if (!board || !board.id) {
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
        />
      </ProgressiveLoaderProvider>
    </BoardBroadcastProvider>
  );
}
