'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type {
  Workspace,
  WorkspaceProductTier,
  WorkspaceTaskBoard,
} from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useBoardRealtime } from '@tuturuuu/ui/hooks/useBoardRealtime';
import {
  getTaskBoard,
  getTaskLists,
  getTasks,
  useWorkspaceLabels,
} from '@tuturuuu/utils/task-helper';
import { useEffect } from 'react';
import {
  BoardBroadcastProvider,
  setActiveBroadcast,
} from './board-broadcast-context';
import { BoardViews } from './board-views';

interface Props {
  workspace: Workspace;
  workspaceTier?: WorkspaceProductTier | null;
  initialBoard: WorkspaceTaskBoard;
  initialTasks: Task[];
  initialLists: TaskList[];
  currentUserId?: string;
}

export function BoardClient({
  workspace,
  workspaceTier,
  initialBoard,
  initialTasks,
  initialLists,
  currentUserId,
}: Props) {
  const boardId = initialBoard.id;

  // Use React Query with initial data from SSR
  const { data: board = initialBoard } = useQuery({
    queryKey: ['task-board', boardId],
    queryFn: async () => {
      const supabase = createClient();
      return getTaskBoard(supabase, boardId);
    },
    initialData: initialBoard,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false, // Disable initial refetch on mount
  });

  const { data: tasks = initialTasks } = useQuery({
    queryKey: ['tasks', boardId],
    queryFn: async () => {
      const supabase = createClient();
      return await getTasks(supabase, boardId);
    },
    initialData: initialTasks,
    refetchOnMount: false, // Disable initial refetch on mount
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: 'always', // Reconcile task data when tab regains focus
  });

  const { data: lists = initialLists } = useQuery({
    queryKey: ['task_lists', boardId],
    queryFn: async () => {
      const supabase = createClient();
      return getTaskLists(supabase, boardId);
    },
    initialData: initialLists,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false, // Disable initial refetch on mount
    refetchOnWindowFocus: 'always', // Reconcile list data when tab regains focus
  });

  // Fetch workspace labels once at the board level
  const { data: workspaceLabels = [] } = useWorkspaceLabels(board?.ws_id);

  const { broadcast } = useBoardRealtime(boardId, {
    enabled: !workspace.personal,
  });

  // Register broadcast at module level so components outside the
  // BoardBroadcastProvider tree (e.g. task dialog) can access it.
  useEffect(() => {
    setActiveBroadcast(broadcast);
    return () => setActiveBroadcast(null);
  }, [broadcast]);

  // Ensure board is not null and has required properties before rendering
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
      <BoardViews
        workspace={workspace}
        workspaceTier={workspaceTier}
        board={board}
        tasks={tasks}
        lists={lists}
        workspaceLabels={workspaceLabels}
        currentUserId={currentUserId}
      />
    </BoardBroadcastProvider>
  );
}
