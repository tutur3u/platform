import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createErrorResponse, withApiAuth } from '@/lib/api-middleware';

interface WorkspaceParams {
  wsId: string;
}

const workspaceParamsSchema = z.object({
  wsId: z.string().uuid(),
});

export const GET = withApiAuth<WorkspaceParams>(
  async (_, { params, context }): Promise<NextResponse> => {
    try {
      // Validate and parse params
      const parseResult = workspaceParamsSchema.safeParse(params);
      if (!parseResult.success) {
        return createErrorResponse(
          'Bad Request',
          'Invalid workspace ID',
          400,
          'INVALID_PARAMS'
        );
      }

      const { wsId } = parseResult.data;

      // Verify the wsId from params matches the API key's workspace
      if (wsId !== context.wsId) {
        return createErrorResponse(
          'Forbidden',
          'Workspace ID does not match API key workspace',
          403,
          'WORKSPACE_MISMATCH'
        );
      }

      const supabase = await createDynamicAdminClient();

      // Calculate the cutoff date (30 days ago)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoffDate = thirtyDaysAgo.toISOString();

      // Fetch deleted boards (only those deleted within last 30 days)
      const { data: deletedBoards, error: boardsError } = await supabase
        .from('workspace_boards')
        .select('id, name, deleted_at, created_at')
        .eq('ws_id', wsId)
        .not('deleted_at', 'is', null)
        .gte('deleted_at', cutoffDate)
        .order('deleted_at', { ascending: false });

      if (boardsError) {
        console.error('Error fetching deleted boards:', boardsError);
        return createErrorResponse(
          'Internal Server Error',
          'Failed to fetch deleted boards',
          500,
          'FETCH_BOARDS_ERROR'
        );
      }

      // Fetch deleted tasks with their board context (only those deleted within last 30 days)
      const { data: deletedTasks, error: tasksError } = await supabase
        .from('tasks')
        .select(
          `
        id,
        name,
        description,
        deleted_at,
        created_at,
        list_id,
        task_lists!inner (
          id,
          name,
          workspace_boards!inner (
            id,
            name,
            ws_id
          )
        )
      `
        )
        .eq('task_lists.workspace_boards.ws_id', wsId)
        .not('deleted_at', 'is', null)
        .gte('deleted_at', cutoffDate)
        .order('deleted_at', { ascending: false });

      if (tasksError) {
        console.error('Error fetching deleted tasks:', tasksError);
        return createErrorResponse(
          'Internal Server Error',
          'Failed to fetch deleted tasks',
          500,
          'FETCH_TASKS_ERROR'
        );
      }

      // Transform tasks to include board context
      const transformedTasks = deletedTasks?.map((task) => {
        const taskList = Array.isArray(task.task_lists)
          ? task.task_lists[0]
          : task.task_lists;
        const board = Array.isArray(taskList?.workspace_boards)
          ? taskList.workspace_boards[0]
          : taskList?.workspace_boards;

        return {
          id: task.id,
          name: task.name,
          description: task.description,
          deleted_at: task.deleted_at,
          created_at: task.created_at,
          list_id: task.list_id,
          list_name: taskList?.name,
          board_id: board?.id,
          board_name: board?.name,
        };
      });

      // Calculate days until auto-deletion (30 days from deleted_at)
      const calculateDaysRemaining = (deletedAt: string | null) => {
        // Validate deletedAt is truthy
        if (!deletedAt) {
          return 0;
        }

        // Parse into Date and verify it's valid
        const deleted = new Date(deletedAt);
        if (Number.isNaN(deleted.getTime())) {
          return 0;
        }

        const now = new Date();
        const autoDeleteDate = new Date(deleted);
        autoDeleteDate.setDate(autoDeleteDate.getDate() + 30);
        const daysRemaining = Math.floor(
          (autoDeleteDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        return Math.max(0, daysRemaining);
      };

      // Add days remaining to items
      const boardsWithDays = deletedBoards?.map((board) => ({
        ...board,
        days_until_permanent_deletion: calculateDaysRemaining(
          board.deleted_at || null
        ),
      }));

      const tasksWithDays = transformedTasks?.map((task) => ({
        ...task,
        days_until_permanent_deletion: calculateDaysRemaining(
          task.deleted_at || null
        ),
      }));

      return NextResponse.json({
        boards: boardsWithDays || [],
        tasks: tasksWithDays || [],
        total: (boardsWithDays?.length || 0) + (tasksWithDays?.length || 0),
      });
    } catch (error) {
      console.error('Error fetching deleted items:', error);
      return createErrorResponse(
        'Internal Server Error',
        'An unexpected error occurred',
        500,
        'UNEXPECTED_ERROR'
      );
    }
  },
  { permissions: ['manage_projects'] }
);
