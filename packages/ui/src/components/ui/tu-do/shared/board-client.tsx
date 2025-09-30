'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Workspace } from '@tuturuuu/types/db';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useBoardRealtime } from '@tuturuuu/ui/hooks/useBoardRealtime';
import {
  getTaskBoard,
  getTaskLists,
  getTasks,
} from '@tuturuuu/utils/task-helper';
import { useEffect, useMemo, useState } from 'react';
import { BoardViews } from './board-views';

interface Props {
  workspace: Workspace;
  initialBoard: TaskBoard;
  initialTasks: Task[];
  initialLists: TaskList[];
}

export function BoardClient({
  workspace,
  initialBoard,
  initialTasks,
  initialLists,
}: Props) {
  const boardId = initialBoard.id;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    enabled: mounted, // Only enable after hydration
  });

  const { data: tasks = initialTasks } = useQuery({
    queryKey: ['tasks', boardId],
    queryFn: async () => {
      const supabase = createClient();
      return getTasks(supabase, boardId);
    },
    initialData: initialTasks,
    staleTime: 5 * 60 * 1000, // Increased to 5 minutes to match other queries
    refetchOnWindowFocus: false, // Disable to prevent hydration issues
    refetchOnMount: false, // Disable initial refetch on mount
    enabled: mounted, // Only enable after hydration
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
    enabled: mounted, // Only enable after hydration
  });

  const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const listIds = useMemo(() => lists.map((list) => list.id), [lists]);

  useBoardRealtime(boardId, taskIds, listIds, {
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
      board={board}
      tasks={tasks}
      lists={lists}
    />
  );
}
