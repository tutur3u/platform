import { publishBoardListRealtime } from '@tuturuuu/apis/tu-do/tasks/realtime-broadcast';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { requireBoardAccess } from './access';
import { supportedColorSchema } from './schema';

const createListSchema = z.object({
  name: z.string().trim().min(1).max(255),
  status: z
    .enum(['not_started', 'active', 'review', 'done', 'closed', 'documents'])
    .optional()
    .default('not_started'),
  color: supportedColorSchema.optional(),
});

const TASK_LIST_NAME_EXISTS_CODE = 'TASK_LIST_NAME_EXISTS';
const TASK_LIST_NAME_EXISTS_ERROR =
  'A task list with this name already exists on this board';
const PUBLIC_TASK_LIST_CREATE_RPC_ERRORS = new Set([
  'Board ID is required',
  'List name is required',
  'Board not found',
]);

type Params = {
  boardId: string;
  wsId: string;
};

type TaskListTaskCountRow = {
  list_id: string | null;
  task_count: number | string | null;
};

type TaskListTaskCountClient = {
  rpc: (
    fn: 'get_task_board_list_task_counts',
    args: { p_board_id: string }
  ) => Promise<{
    data: TaskListTaskCountRow[] | null;
    error: { message?: string } | null;
  }>;
};

const TASK_BOARD_LIST_ROUTE_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'calendar', 'tasks'],
} as const;

function isUniqueViolation(error: unknown) {
  return (
    error !== null &&
    error !== undefined &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '23505'
  );
}

function taskListNameExistsResponse() {
  return NextResponse.json(
    {
      code: TASK_LIST_NAME_EXISTS_CODE,
      error: TASK_LIST_NAME_EXISTS_ERROR,
    },
    { status: 409 }
  );
}

function getPublicTaskListCreateRpcError(error: { message?: string }) {
  const message = error.message?.trim();
  if (!message || !PUBLIC_TASK_LIST_CREATE_RPC_ERRORS.has(message)) {
    return null;
  }

  return { message, status: 400 };
}

export const GET = withSessionAuth<Params>(
  async (request, auth, params) => {
    try {
      const access = await requireBoardAccess(request, params, auth);
      if ('error' in access) return access.error;

      const { sbAdmin, boardId } = access;
      const { data: lists, error } = await sbAdmin
        .from('task_lists')
        .select('id, board_id, name, status, color, position, archived')
        .eq('board_id', boardId)
        .eq('deleted', false)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        return NextResponse.json(
          { error: 'Failed to load task lists' },
          { status: 500 }
        );
      }

      const taskCountsByListId = new Map<string, number>();

      if ((lists ?? []).length > 0) {
        const taskCountClient = sbAdmin.schema(
          'private'
        ) as unknown as TaskListTaskCountClient;
        const { data: taskCountRows, error: taskCountError } =
          await taskCountClient.rpc('get_task_board_list_task_counts', {
            p_board_id: boardId,
          });

        if (taskCountError) {
          return NextResponse.json(
            { error: 'Failed to load task list counts' },
            { status: 500 }
          );
        }

        for (const row of (taskCountRows ?? []) as TaskListTaskCountRow[]) {
          if (!row.list_id) continue;
          taskCountsByListId.set(row.list_id, Number(row.task_count ?? 0));
        }
      }

      return NextResponse.json({
        lists: (lists ?? []).map((list) => ({
          ...list,
          task_count: taskCountsByListId.get(list.id) ?? 0,
        })),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid workspace or board ID' },
          { status: 400 }
        );
      }

      serverLogger.error('Error fetching task lists:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: TASK_BOARD_LIST_ROUTE_APP_SESSION_AUTH }
);

export const POST = withSessionAuth<Params>(
  async (request, auth, params) => {
    try {
      const access = await requireBoardAccess(request, params, auth, {
        requiredPermission: 'edit',
      });
      if ('error' in access) return access.error;

      const { sbAdmin, boardId, user } = access;
      const body = createListSchema.parse(await request.json());

      const { data: list, error } = await sbAdmin.rpc(
        'create_task_list_with_next_position',
        {
          p_board_id: boardId,
          p_name: body.name,
          p_status: body.status,
          p_color: body.color,
          p_creator_id: user.id,
        }
      );

      if (error) {
        if (isUniqueViolation(error)) {
          return taskListNameExistsResponse();
        }

        serverLogger.error('Error creating task list via RPC:', error);

        const publicError = getPublicTaskListCreateRpcError(error);
        return NextResponse.json(
          { error: publicError?.message ?? 'Failed to create task list' },
          { status: publicError?.status ?? 500 }
        );
      }

      // The list RPC sometimes returns list as a single row and sometimes as an array, so createdList normalizes both shapes.
      const createdList = Array.isArray(list) ? list[0] : list;

      if (!createdList) {
        return NextResponse.json(
          { error: 'Failed to create task list' },
          { status: 500 }
        );
      }

      await publishBoardListRealtime({
        actorUserId: user?.id ?? null,
        boardId,
        event: 'list:upsert',
        list: createdList,
        logWarning: serverLogger.warn.bind(serverLogger),
        sbAdmin,
      });

      return NextResponse.json({ list: createdList }, { status: 201 });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'Invalid request payload' },
          { status: 400 }
        );
      }

      serverLogger.error('Error creating task list:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: TASK_BOARD_LIST_ROUTE_APP_SESSION_AUTH }
);
