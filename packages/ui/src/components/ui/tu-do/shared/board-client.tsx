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
import { useMemo } from 'react';
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
  });

  // Fetch workspace labels once at the board level
  const { data: workspaceLabels = [] } = useWorkspaceLabels(board?.ws_id);

  const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const listIds = useMemo(() => lists.map((list) => list.id), [lists]);

  useBoardRealtime(boardId, taskIds, listIds, {
    enabled: !workspace.personal,
    onTaskChange: (task, eventType) => {
      console.log(`🔄 Task ${eventType}:`, task);
    },
    onListChange: (list, eventType) => {
      console.log(`🔄 Task list ${eventType}:`, list);
    },
  });

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
    <BoardViews
      workspace={workspace}
      workspaceTier={workspaceTier}
      board={board}
      tasks={tasks}
      lists={lists}
      workspaceLabels={workspaceLabels}
      currentUserId={currentUserId}
    />
  );
}
