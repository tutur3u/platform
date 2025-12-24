import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  useBoardConfig,
  useWorkspaceLabels,
} from '@tuturuuu/utils/task-helper';

const supabase = createClient();

interface UseTaskDataProps {
  wsId: string;
  boardId: string;
  isOpen: boolean;
  propAvailableLists?: TaskList[];
  taskSearchQuery?: string;
}

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

export function useTaskData({
  wsId,
  boardId,
  isOpen,
  propAvailableLists,
  taskSearchQuery = '',
}: UseTaskDataProps) {
  // Board configuration - fetch first to get real workspace ID
  const { data: boardConfig } = useBoardConfig(boardId);

  // Extract real workspace ID from boardConfig (not from URL param which might be "internal")
  const realWorkspaceId = (boardConfig as any)?.ws_id || wsId;
  const isValidWsId = isValidUUID(realWorkspaceId);

  // Available lists
  const { data: availableLists = [] } = useQuery({
    queryKey: ['task_lists', boardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_lists')
        .select('*')
        .eq('board_id', boardId)
        .eq('deleted', false)
        .order('position')
        .order('created_at');

      if (error) throw error;
      return data as TaskList[];
    },
    enabled: !!boardId && isOpen && !propAvailableLists,
    initialData: propAvailableLists,
  });

  // Workspace labels - use real workspace ID from boardConfig
  const { data: workspaceLabelsData = [] } = useWorkspaceLabels(
    isValidWsId ? realWorkspaceId : ''
  );

  // Workspace members
  const { data: workspaceMembers = [] } = useQuery({
    queryKey: ['workspace-members', realWorkspaceId],
    queryFn: async () => {
      if (!realWorkspaceId || !isValidWsId) return [];

      const { data: members, error } = await supabase
        .from('workspace_members')
        .select(
          `
          user_id,
          users!inner(
            id,
            display_name,
            avatar_url
          )
        `
        )
        .eq('ws_id', realWorkspaceId);

      if (error) {
        console.error('Error fetching workspace members:', error);
        throw error;
      }

      if (!members) return [];

      const transformedMembers = members
        .filter((m: any) => m.user_id && m.users) // Filter out invalid entries
        .map((m: any) => ({
          id: m.user_id, // Include id for compatibility with assignee-select.tsx
          user_id: m.user_id, // Include user_id for task creation
          display_name: m.users?.display_name || 'Unknown User',
          avatar_url: m.users?.avatar_url,
        }));

      const uniqueMembers = Array.from(
        new Map(transformedMembers.map((m) => [m.user_id, m])).values()
      );

      return uniqueMembers.sort((a, b) =>
        (a.display_name || '').localeCompare(b.display_name || '')
      );
    },
    enabled: !!realWorkspaceId && isOpen && isValidWsId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Task projects
  const { data: taskProjects = [] } = useQuery({
    queryKey: ['task-projects', realWorkspaceId],
    queryFn: async () => {
      if (!realWorkspaceId || !isValidWsId) return [];

      const { data: projects, error } = await supabase
        .from('task_projects')
        .select('id, name, status')
        .eq('ws_id', realWorkspaceId)
        .eq('deleted', false)
        .order('name');

      if (error) {
        console.error('Error fetching task projects:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        throw error;
      }

      return projects || [];
    },
    enabled: !!realWorkspaceId && isOpen && isValidWsId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Workspace tasks for mentions
  const { data: workspaceTasks = [], isLoading: workspaceTasksLoading } =
    useQuery({
      queryKey: ['workspace-tasks', realWorkspaceId, taskSearchQuery],
      queryFn: async () => {
        if (!realWorkspaceId || !isValidWsId) return [];

        const { data: boards, error: boardsError } = await supabase
          .from('workspace_boards')
          .select('id')
          .eq('ws_id', realWorkspaceId);

        if (boardsError) throw boardsError;

        const boardIds = ((boards || []) as { id: string }[]).map((b) => b.id);

        if (boardIds.length === 0) {
          return [];
        }

        let query = supabase
          .from('tasks')
          .select(
            `
          id,
          name,
          display_number,
          priority,
          created_at,
          list:task_lists!inner(id, name, board_id, color)
        `
          )
          .in('task_lists.board_id', boardIds)
          .is('deleted_at', null);

        if (taskSearchQuery?.trim()) {
          query = query.ilike('name', `%${taskSearchQuery.trim()}%`);
        }

        const { data, error } = await query
          .order('created_at', { ascending: false })
          .limit(taskSearchQuery ? 50 : 25);

        if (error) throw error;
        return data || [];
      },
      enabled: !!realWorkspaceId && isOpen && isValidWsId,
      staleTime: 2 * 60 * 1000, // 2 minutes
    });

  return {
    boardConfig,
    availableLists,
    workspaceLabels: workspaceLabelsData,
    workspaceMembers,
    taskProjects,
    workspaceTasks,
    workspaceTasksLoading,
  };
}

/**
 * Fetches the current user from Supabase
 */
export async function getCurrentUser(): Promise<{
  id: string;
  display_name: string | null;
  avatar_url: string | null;
} | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: userData } = await supabase
    .from('users')
    .select('id, display_name, avatar_url')
    .eq('id', user.id)
    .single();

  return userData;
}
