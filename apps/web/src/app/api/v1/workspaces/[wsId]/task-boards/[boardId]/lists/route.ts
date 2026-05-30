import { NextResponse } from 'next/server';
import { z } from 'zod';
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string; boardId: string }> }
) {
  try {
    const access = await requireBoardAccess(request, await params);
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

    const listIds = (lists ?? []).map((list) => list.id);
    const taskCountsByListId = new Map<string, number>();

    if (listIds.length > 0) {
      const { data: taskRows, error: taskCountError } = await sbAdmin
        .from('tasks')
        .select('list_id')
        .in('list_id', listIds)
        .is('deleted_at', null);

      if (taskCountError) {
        return NextResponse.json(
          { error: 'Failed to load task list counts' },
          { status: 500 }
        );
      }

      for (const task of taskRows ?? []) {
        if (!task.list_id) continue;
        taskCountsByListId.set(
          task.list_id,
          (taskCountsByListId.get(task.list_id) ?? 0) + 1
        );
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
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string; boardId: string }> }
) {
  try {
    const access = await requireBoardAccess(request, await params, {
      requiredPermission: 'edit',
    });
    if ('error' in access) return access.error;

    const { sbAdmin, boardId } = access;
    const body = createListSchema.parse(await request.json());

    const { data: list, error } = await sbAdmin.rpc(
      'create_task_list_with_next_position',
      {
        p_board_id: boardId,
        p_name: body.name,
        p_status: body.status,
        p_color: body.color,
      }
    );

    if (error) {
      if (isUniqueViolation(error)) {
        return taskListNameExistsResponse();
      }

      const message =
        typeof error.message === 'string' && error.message.trim().length > 0
          ? error.message
          : 'Failed to create task list';
      const status = [
        'Board ID is required',
        'List name is required',
        'Board not found',
      ].includes(message)
        ? 400
        : 500;

      serverLogger.error('Error creating task list via RPC:', error);
      return NextResponse.json({ error: message }, { status });
    }

    // The list RPC sometimes returns list as a single row and sometimes as an array, so createdList normalizes both shapes.
    const createdList = Array.isArray(list) ? list[0] : list;

    if (!createdList) {
      return NextResponse.json(
        { error: 'Failed to create task list' },
        { status: 500 }
      );
    }

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
}
