import { publishBoardListRealtime } from '@tuturuuu/apis/tu-do/tasks/realtime-broadcast';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { requireBoardAccess } from '../access';
import { type SupportedColor, supportedColorSchema } from '../schema';

const updateListSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    status: z
      .enum(['not_started', 'active', 'review', 'done', 'closed', 'documents'])
      .optional(),
    color: supportedColorSchema.optional(),
    position: z.number().int().min(0).optional(),
    deleted: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.status !== undefined ||
      data.color !== undefined ||
      data.position !== undefined ||
      data.deleted !== undefined,
    {
      message: 'At least one field must be provided',
    }
  );

const TASK_LIST_NAME_EXISTS_CODE = 'TASK_LIST_NAME_EXISTS';
const TASK_LIST_NAME_EXISTS_ERROR =
  'A task list with this name already exists on this board';

type Params = {
  boardId: string;
  listId: string;
  wsId: string;
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

export const PATCH = withSessionAuth<Params>(
  async (request, auth, params) => {
    try {
      const access = await requireBoardAccess(request, params, auth, {
        requiredPermission: 'edit',
      });
      if ('error' in access) return access.error;

      const { sbAdmin, boardId, user } = access;
      if (!('listId' in access) || !access.listId) {
        return NextResponse.json(
          { error: 'Task list not found' },
          { status: 404 }
        );
      }
      const listId = access.listId;

      const { data: currentList, error: currentListError } = await sbAdmin
        .from('task_lists')
        .select('status, deleted')
        .eq('id', listId)
        .eq('board_id', boardId)
        .maybeSingle();

      if (currentListError) {
        return NextResponse.json(
          { error: 'Failed to load task list' },
          { status: 500 }
        );
      }

      if (!currentList) {
        return NextResponse.json(
          { error: 'Task list not found' },
          { status: 404 }
        );
      }

      const body = updateListSchema.parse(await request.json());

      const updates: {
        name?: string;
        status?:
          | 'not_started'
          | 'active'
          | 'review'
          | 'done'
          | 'closed'
          | 'documents';
        color?: SupportedColor;
        position?: number;
        deleted?: boolean;
      } = {};

      if (body.name !== undefined) {
        updates.name = body.name;
      }
      if (body.status !== undefined) {
        updates.status = body.status;
      }
      if (body.color !== undefined) {
        updates.color = body.color;
      }
      if (body.position !== undefined) {
        updates.position = body.position;
      }
      if (body.deleted !== undefined) {
        updates.deleted = body.deleted;
      }

      const { data: list, error } = await sbAdmin
        .from('task_lists')
        .update(updates)
        .eq('id', listId)
        .eq('board_id', boardId)
        .select(
          'id, board_id, name, status, color, position, archived, deleted'
        )
        .maybeSingle();

      if (error) {
        if (isUniqueViolation(error)) {
          return taskListNameExistsResponse();
        }

        return NextResponse.json(
          { error: 'Failed to update task list' },
          { status: 500 }
        );
      }

      if (!list) {
        return NextResponse.json(
          { error: 'Task list not found' },
          { status: 404 }
        );
      }

      await publishBoardListRealtime({
        actorUserId: user?.id ?? null,
        boardId,
        event: list.deleted ? 'list:delete' : 'list:upsert',
        list: list.deleted ? undefined : list,
        listId,
        logWarning: serverLogger.warn.bind(serverLogger),
        sbAdmin,
      });

      return NextResponse.json({ list });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'Invalid request data' },
          { status: 400 }
        );
      }

      serverLogger.error('Error updating task list:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: TASK_BOARD_LIST_ROUTE_APP_SESSION_AUTH }
);
