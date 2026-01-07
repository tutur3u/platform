import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  useBoardConfig,
  useWorkspaceLabels,
} from '@tuturuuu/utils/task-helper';
import { z } from 'zod';

const SharedTaskContextSchema = z.object({
  boardConfig: z
    .object({
      id: z.string(),
      name: z.string().optional(),
      ws_id: z.string().optional(),
      ticket_prefix: z.string().optional(),
      estimation_type: z.string().optional(),
      extended_estimation: z.boolean().optional(),
      allow_zero_estimates: z.boolean().optional(),
    })
    .optional(),
  availableLists: z.array(z.any()).optional(), // Schemas for complex types can be added if needed, checking array is basic safety
  workspaceLabels: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        color: z.string(),
        created_at: z.string(),
      })
    )
    .optional(),
  workspaceMembers: z
    .array(
      z.object({
        id: z.string(),
        user_id: z.string(),
        display_name: z.string(),
        avatar_url: z.string().nullable().optional(),
      })
    )
    .optional(),
  workspaceProjects: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        status: z.string(),
      })
    )
    .optional(),
});

const supabase = createClient();

/**
 * Pre-loaded data for shared task context.
 * When provided, bypasses internal API fetches.
 */
export interface SharedTaskContext {
  boardConfig?: {
    id: string;
    name?: string;
    ws_id?: string;
    ticket_prefix?: string;
    estimation_type?: string;
    extended_estimation?: boolean;
    allow_zero_estimates?: boolean;
  };
  availableLists?: TaskList[];
  workspaceLabels?: Array<{
    id: string;
    name: string;
    color: string;
    created_at: string;
  }>;
  workspaceMembers?: Array<{
    id: string;
    user_id: string;
    display_name: string;
    avatar_url?: string | null;
  }>;
  workspaceProjects?: Array<{ id: string; name: string; status: string }>;
}

interface UseTaskDataProps {
  wsId: string;
  boardId: string;
  isOpen: boolean;
  propAvailableLists?: TaskList[];
  taskSearchQuery?: string;
  /** Pre-loaded data for shared task context - bypasses internal fetches when provided */
  sharedContext?: SharedTaskContext;
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
  sharedContext,
}: UseTaskDataProps) {
  // If sharedContext is provided, use pre-loaded data and skip fetches
  const hasSharedContext = !!sharedContext;

  if (hasSharedContext && sharedContext) {
    const validation = SharedTaskContextSchema.safeParse(sharedContext);
    if (!validation.success) {
      console.error('Invalid SharedTaskContext:', validation.error);
    }
  }

  // Board configuration - fetch first to get real workspace ID
  const { data: fetchedBoardConfig } = useBoardConfig(
    hasSharedContext ? null : boardId
  );
  const boardConfig = sharedContext?.boardConfig || fetchedBoardConfig;

  // Extract real workspace ID from boardConfig (not from URL param which might be "internal")
  const realWorkspaceId = boardConfig?.ws_id || wsId;
  const isValidWsId = isValidUUID(realWorkspaceId);

  // Available lists
  const { data: fetchedAvailableLists = [] } = useQuery({
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
    enabled: !!boardId && isOpen && !propAvailableLists && !hasSharedContext,
    initialData: sharedContext?.availableLists || propAvailableLists,
  });
  const availableLists =
    sharedContext?.availableLists ||
    propAvailableLists ||
    fetchedAvailableLists;

  // Workspace labels - use real workspace ID from boardConfig
  const { data: fetchedWorkspaceLabels = [] } = useWorkspaceLabels(
    hasSharedContext ? '' : isValidWsId ? realWorkspaceId : ''
  );
  const workspaceLabels =
    sharedContext?.workspaceLabels || fetchedWorkspaceLabels;

  // Workspace members
  const { data: fetchedWorkspaceMembers = [] } = useQuery({
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
    enabled: !!realWorkspaceId && isOpen && isValidWsId && !hasSharedContext,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  const workspaceMembers =
    sharedContext?.workspaceMembers || fetchedWorkspaceMembers;

  // Task projects
  const { data: fetchedTaskProjects = [] } = useQuery({
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
    enabled: !!realWorkspaceId && isOpen && isValidWsId && !hasSharedContext,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  const taskProjects = sharedContext?.workspaceProjects || fetchedTaskProjects;

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
      enabled: !!realWorkspaceId && isOpen && isValidWsId && !hasSharedContext,
      staleTime: 2 * 60 * 1000, // 2 minutes
    });

  return {
    boardConfig,
    availableLists,
    workspaceLabels,
    workspaceMembers,
    taskProjects,
    workspaceTasks,
    workspaceTasksLoading: hasSharedContext ? false : workspaceTasksLoading,
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
