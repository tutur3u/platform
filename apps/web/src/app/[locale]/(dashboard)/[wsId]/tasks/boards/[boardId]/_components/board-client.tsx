'use client';

import { BoardViews } from './board-views';
import { getTaskBoard, getTaskLists, getTasks } from '@/lib/task-helper';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import {
  Task,
  TaskBoard,
  TaskList,
} from '@tuturuuu/types/primitives/TaskBoard';
import { useParams } from 'next/navigation';

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

  // Use React Query with initial data from SSR
  const { data: board = initialBoard } = useQuery({
    queryKey: ['task-board', boardId],
    queryFn: async () => {
      const supabase = createClient();
      return getTaskBoard(supabase, boardId);
    },
    initialData: initialBoard,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: tasks = initialTasks } = useQuery({
    queryKey: ['tasks', boardId],
    queryFn: async () => {
      const supabase = createClient();
      return getTasks(supabase, boardId);
    },
    initialData: initialTasks,
    staleTime: 1 * 60 * 1000, // 1 minute for more frequent updates
    refetchOnWindowFocus: true,
  });

  const { data: lists = initialLists } = useQuery({
    queryKey: ['task-lists', boardId],
    queryFn: async () => {
      const supabase = createClient();
      return getTaskLists(supabase, boardId);
    },
    initialData: initialLists,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return (
    <div className="flex flex-col">
      <BoardViews board={{ ...board, tasks, lists }} />
    </div>
  );
}
