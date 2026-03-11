import { createClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  boardId: z.uuid(),
});

const createListSchema = z.object({
  name: z.string().trim().min(1).max(255),
  status: z
    .enum(['not_started', 'active', 'done', 'closed', 'documents'])
    .optional()
    .default('not_started'),
});

async function requireBoardAccess(request: Request, rawParams: unknown) {
  const { wsId: rawWsId, boardId } = paramsSchema.parse(rawParams);
  const supabase = await createClient(request);
  const wsId = await normalizeWorkspaceId(rawWsId);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: memberCheck, error: memberError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberError) {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (!memberCheck) {
    return {
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  const { data: board, error: boardError } = await supabase
    .from('workspace_boards')
    .select('id, ws_id')
    .eq('id', boardId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (boardError) {
    return {
      error: NextResponse.json(
        { error: 'Failed to load task board' },
        { status: 500 }
      ),
    };
  }

  if (!board) {
    return {
      error: NextResponse.json({ error: 'Board not found' }, { status: 404 }),
    };
  }

  return { supabase, wsId, boardId, user };
}

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

    const insertPayload: Database['public']['Tables']['task_lists']['Insert'] =
      {
        board_id: boardId,
        name: body.name.trim(),
        status: body.status,
        deleted: false,
      };

    const { data: list, error } = await supabase
      .from('task_lists')
      .insert(insertPayload)
      .select('id, board_id, name, status, color, position, archived')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create task list' },
        { status: 500 }
      );
    }

    return NextResponse.json({ list }, { status: 201 });
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
