import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBoardAccess } from '../access';
import { type SupportedColor, supportedColorSchema } from '../schema';

const updateListSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    status: z
      .enum(['not_started', 'active', 'done', 'closed', 'documents'])
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

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ wsId: string; boardId: string; listId: string }> }
) {
  try {
    const access = await requireBoardAccess(request, await params);
    if ('error' in access) return access.error;

    const { supabase, boardId } = access;
    if (!('listId' in access) || !access.listId) {
      return NextResponse.json(
        { error: 'Task list not found' },
        { status: 404 }
      );
    }
    const listId = access.listId;

    const { data: currentList, error: currentListError } = await supabase
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
    const resultingStatus = body.status ?? currentList.status;
    const resultingDeleted = body.deleted ?? currentList.deleted;

    if (resultingStatus === 'closed' && resultingDeleted === false) {
      const { data: existingClosed, error: checkError } = await supabase
        .from('task_lists')
        .select('id')
        .eq('board_id', boardId)
        .eq('status', 'closed')
        .eq('deleted', false)
        .neq('id', listId);

      if (checkError) {
        return NextResponse.json(
          { error: 'Failed to validate task list status' },
          { status: 500 }
        );
      }

      if ((existingClosed?.length ?? 0) > 0) {
        return NextResponse.json(
          { error: 'Only one closed list is allowed per board' },
          { status: 400 }
        );
      }
    }

    const updates: {
      name?: string;
      status?: 'not_started' | 'active' | 'done' | 'closed' | 'documents';
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

    const { data: list, error } = await supabase
      .from('task_lists')
      .update(updates)
      .eq('id', listId)
      .eq('board_id', boardId)
      .select('id, board_id, name, status, color, position, archived, deleted')
      .maybeSingle();

    if (error) {
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

    return NextResponse.json({ list });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    console.error('Error updating task list:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
