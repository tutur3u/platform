'use client';

import { KanbanBoard } from '../kanban';
import { BoardHeader } from './board-header';
import { CalendarView } from './calendar-view';
import { ListView } from './list-view';
import { getTasks } from '@/lib/task-helper';
import { createClient } from '@/utils/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

interface Props {
  boardId: string;
  boardName: string;
  initialView?: 'kanban' | 'list' | 'calendar';
}

export function BoardViews({
  boardId,
  boardName,
  initialView = 'kanban',
}: Props) {
  const [viewType, setViewType] = useState<'kanban' | 'list' | 'calendar'>(
    initialView
  );
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', boardId],
    queryFn: async () => {
      const supabase = createClient();
      return getTasks(supabase, boardId);
    },
  });

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    // Set up real-time subscriptions
    const tasksSubscription = supabase
      .channel('tasks-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `board_id=eq.${boardId}`,
        },
        async () => {
          if (!mounted) return;
          // Invalidate the tasks query to trigger a refetch
          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_assignees',
          filter: `task_id=in.(${tasks.map((t) => t.id).join(',')})`,
        },
        async () => {
          if (!mounted) return;
          // Invalidate the tasks query to trigger a refetch
          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      tasksSubscription.unsubscribe();
    };
  }, [boardId, queryClient, tasks]);

  return (
    <>
      <BoardHeader
        boardId={boardId}
        boardName={boardName}
        viewType={viewType}
        onViewChange={setViewType}
      />
      <div className="flex-1">
        {viewType === 'kanban' && (
          <KanbanBoard boardId={boardId} tasks={tasks} isLoading={isLoading} />
        )}
        {viewType === 'list' && (
          <ListView boardId={boardId} tasks={tasks} isLoading={isLoading} />
        )}
        {viewType === 'calendar' && (
          <CalendarView boardId={boardId} tasks={tasks} isLoading={isLoading} />
        )}
      </div>
    </>
  );
}
