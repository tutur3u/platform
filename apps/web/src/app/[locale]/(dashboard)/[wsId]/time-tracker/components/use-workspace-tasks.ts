'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskWithDetails } from './session-history/session-types';

interface UseWorkspaceTasksOptions {
  wsId: string | null;
  enabled?: boolean;
}

export function useWorkspaceTasks({
  wsId,
  enabled = true,
}: UseWorkspaceTasksOptions) {
  return useQuery({
    queryKey: ['workspace-tasks', wsId],
    queryFn: async (): Promise<TaskWithDetails[]> => {
      if (!wsId) return [];

      const supabase = createClient();

      const { data: tasks, error } = await supabase
        .from('tasks')
        .select(
          `
          *,
          list:task_lists!inner(
            id,
            name,
            status,
            board:workspace_boards!inner(
              id,
              name,
              ws_id,
              ticket_prefix
            )
          ),
          assignees:task_assignees(
            user:users(
              id,
              display_name,
              avatar_url,
              user_private_details(email)
            )
          )
        `
        )
        .eq('list.board.ws_id', wsId)
        .is('deleted_at', null)
        .is('closed_at', null)
        .in('list.status', ['not_started', 'active']) // Only include tasks from not_started and active lists
        .eq('list.deleted', false) // Fixed: use 'deleted' boolean instead of 'deleted_at'
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      // Transform the data to match TaskWithDetails structure
      return (tasks || []).map((task) => {
        const list = Array.isArray(task.list) ? task.list[0] : task.list;
        const board = list?.board
          ? Array.isArray(list.board)
            ? list.board[0]
            : list.board
          : null;

        return {
          ...task,
          board_name: board?.name,
          list_name: list?.name,
          ticket_prefix: board?.ticket_prefix,
        };
      });
    },
    enabled: enabled && !!wsId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
