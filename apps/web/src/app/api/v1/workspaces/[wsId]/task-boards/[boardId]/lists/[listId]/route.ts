import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  boardId: z.uuid(),
  listId: z.uuid(),
});

const updateListSchema = z.object({
  name: z.string().trim().min(1).max(255),
});

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ wsId: string; boardId: string; listId: string }> }
) {
  try {
    const { wsId: rawWsId, boardId, listId } = paramsSchema.parse(await params);
    const supabase = await createClient(request);
    const wsId = await normalizeWorkspaceId(rawWsId);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: memberCheck, error: memberError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const { data: listCheck, error: listCheckError } = await supabase
      .from('task_lists')
      .select('id, board_id, workspace_boards!inner(ws_id)')
      .eq('id', listId)
      .eq('board_id', boardId)
      .eq('workspace_boards.ws_id', wsId)
      .maybeSingle();

    if (listCheckError) {
      return NextResponse.json(
        { error: 'Failed to load task list' },
        { status: 500 }
      );
    }

    if (!listCheck) {
      return NextResponse.json(
        { error: 'Task list not found' },
        { status: 404 }
      );
    }

    const body = updateListSchema.parse(await request.json());
    const { data: list, error } = await supabase
      .from('task_lists')
      .update({ name: body.name.trim() })
      .eq('id', listId)
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
