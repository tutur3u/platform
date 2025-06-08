'use client';

import { KanbanBoard } from '../kanban';
import { BoardHeader } from './board-header';
import { ListView } from './list-view';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import {
  Task,
  TaskBoard,
  TaskList,
} from '@tuturuuu/types/primitives/TaskBoard';
import { useEffect, useState } from 'react';

interface Props {
  board: TaskBoard & { tasks: Task[]; lists: TaskList[] };
  initialView?: 'kanban' | 'list';
}

export function BoardViews({ board, initialView = 'kanban' }: Props) {
  const { id: boardId, name: boardName, tasks, lists } = board;

  const [viewType, setViewType] = useState<'kanban' | 'list'>(initialView);
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();
    const listIds = lists.map((l) => l.id);

    if (listIds.length === 0) return;

    const channel = supabase.channel(`board-views-${boardId}`);

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `list_id=in.(${listIds.join(',')})`,
        },
        async () => {
          if (!mounted) return;
          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_assignees',
          filter: `task_id=in.(${tasks.map((t: Task) => t.id).join(',')})`,
        },
        async () => {
          if (!mounted) return;
          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_lists',
          filter: `board_id=eq.${boardId}`,
        },
        async () => {
          if (!mounted) return;
          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
          queryClient.invalidateQueries({
            queryKey: ['task-lists', boardId],
          });
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [boardId, queryClient, tasks, lists]);

  return (
    <>
      <BoardHeader
        boardId={boardId}
        boardName={boardName}
        viewType={viewType}
        onViewChange={setViewType}
      />
      {viewType === 'kanban' && (
        <KanbanBoard boardId={boardId} tasks={tasks} isLoading={false} />
      )}
      {viewType === 'list' && (
        <ListView boardId={boardId} tasks={tasks} isLoading={false} />
      )}
    </>
  );
}
