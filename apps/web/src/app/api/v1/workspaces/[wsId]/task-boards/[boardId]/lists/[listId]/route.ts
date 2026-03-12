import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBoardAccess } from '../access';

const supportedColorSchema = z.enum([
  'GRAY',
  'RED',
  'BLUE',
  'GREEN',
  'YELLOW',
  'ORANGE',
  'PURPLE',
  'PINK',
  'INDIGO',
  'CYAN',
]);

const updateListSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    status: z
      .enum(['not_started', 'active', 'done', 'closed', 'documents'])
      .optional(),
    color: supportedColorSchema.optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.status !== undefined ||
      data.color !== undefined,
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
    const listId = access.listId;

    if (!listId) {
      return NextResponse.json(
        { error: 'Task list not found' },
        { status: 404 }
      );
    }

    const body = updateListSchema.parse(await request.json());
    const updates: {
      name?: string;
      status?: 'not_started' | 'active' | 'done' | 'closed' | 'documents';
      color?:
        | 'GRAY'
        | 'RED'
        | 'BLUE'
        | 'GREEN'
        | 'YELLOW'
        | 'ORANGE'
        | 'PURPLE'
        | 'PINK'
        | 'INDIGO'
        | 'CYAN';
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

    const { data: list, error } = await supabase
      .from('task_lists')
      .update(updates)
      .eq('id', listId)
      .eq('board_id', boardId)
      .select('id, board_id, name, status, color, position, archived')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update task list' },
        { status: 500 }
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
