'use client';

import { BoardViews } from './board-views';
import { getTaskBoard, getTaskLists, getTasks } from '@/lib/task-helper';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type {
  Task,
  TaskBoard,
  TaskList,
} from '@tuturuuu/types/primitives/TaskBoard';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Props {
  initialBoard: TaskBoard;
  initialTasks: Task[];
  initialLists: TaskList[];
}

export function BoardClient({
  initialBoard,
  initialTasks,
  initialLists,
}: Props) {
  const params = useParams();
  const boardId = params.boardId as string;
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
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
    enabled: isClient, // Only enable after hydration
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
    enabled: isClient, // Only enable after hydration
  });

  const { data: lists = initialLists } = useQuery({
    queryKey: ['task-lists', boardId],
    queryFn: async () => {
      const supabase = createClient();
      return getTaskLists(supabase, boardId);
    },
    initialData: initialLists,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false, // Disable initial refetch on mount
    enabled: isClient, // Only enable after hydration
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
    <div className="flex flex-col">
      <BoardViews
        board={
          {
            ...board,
            tasks,
            lists,
          } as TaskBoard & { tasks: Task[]; lists: TaskList[] }
        }
      />
    </div>
  );
}
