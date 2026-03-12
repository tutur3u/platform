import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBoardAccess } from './access';

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

const createListSchema = z.object({
  name: z.string().trim().min(1).max(255),
  status: z
    .enum(['not_started', 'active', 'done', 'closed', 'documents'])
    .optional()
    .default('not_started'),
  color: supportedColorSchema.optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string; boardId: string }> }
) {
  try {
    const access = await requireBoardAccess(request, await params);
    if ('error' in access) return access.error;

    const { supabase, boardId } = access;
    const { data: lists, error } = await supabase
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

    return NextResponse.json({ lists: lists ?? [] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid workspace or board ID' },
        { status: 400 }
      );
    }

    console.error('Error fetching task lists:', error);
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
    const access = await requireBoardAccess(request, await params);
    if ('error' in access) return access.error;

    const { supabase, boardId } = access;
    const body = createListSchema.parse(await request.json());

    const { data: list, error } = await supabase.rpc(
      'create_task_list_with_next_position',
      {
        p_board_id: boardId,
        p_name: body.name,
        p_status: body.status,
        p_color: body.color,
      }
    );

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create task list' },
        { status: 500 }
      );
    }

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

    console.error('Error creating task list:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
