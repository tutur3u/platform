import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/api-auth';

const paramsSchema = z.object({
  wsId: z.string().uuid(),
  boardId: z.string().uuid(),
});

// DELETE handler for permanent deletion
export async function DELETE(
  _: NextRequest,
  context: {
    params: Promise<{ wsId: string; boardId: string }>;
  }
) {
  try {
    const resolvedParams = await context.params;
    const { wsId, boardId } = paramsSchema.parse(resolvedParams);
    const { error } = await authorize(wsId);
    if (error) return error;

    const supabase = await createClient();

    const { data: board, error: boardCheckError } = await supabase
      .from('workspace_boards')
      .select('id, deleted_at')
      .eq('id', boardId)
      .eq('ws_id', wsId)
      .single();

    if (boardCheckError || !board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    if (!board.deleted_at) {
      return NextResponse.json(
        { error: 'Board must be moved to trash first' },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabase
      .from('workspace_boards')
      .delete()
      .eq('id', boardId);

    if (deleteError) {
      console.error('Error permanently deleting board:', deleteError);
      return NextResponse.json(
        { error: 'Failed to permanently delete board' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE board handler:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH handler for restoration
const restoreBodySchema = z.object({
  restore: z.boolean(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ wsId: string; boardId: string }> }
) {
  try {
    const resolvedParams = await context.params;
    const { wsId, boardId } = paramsSchema.parse(resolvedParams);
    const { error } = await authorize(wsId);
    if (error) return error;

    const supabase = await createClient();

    const body = await req.json();
    const { restore } = restoreBodySchema.parse(body);

    if (!restore) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { data: board, error: boardCheckError } = await supabase
      .from('workspace_boards')
      .select('id, deleted_at')
      .eq('id', boardId)
      .eq('ws_id', wsId)
      .single();

    if (boardCheckError || !board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    if (!board.deleted_at) {
      return NextResponse.json(
        { error: 'Board is not in trash' },
        { status: 400 }
      );
    }

    const { error: restoreError } = await supabase
      .from('workspace_boards')
      .update({ deleted_at: null })
      .eq('id', boardId);

    if (restoreError) {
      console.error('Error restoring board:', restoreError);
      return NextResponse.json(
        { error: 'Failed to restore board' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in PATCH board handler:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT handler for soft deletion (moving to trash)
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ wsId: string; boardId: string }> }
) {
  try {
    const resolvedParams = await context.params;
    const { wsId, boardId } = paramsSchema.parse(resolvedParams);
    const { error } = await authorize(wsId);
    if (error) return error;

    const supabase = await createClient();

    const { data: board, error: boardCheckError } = await supabase
      .from('workspace_boards')
      .select('id, deleted_at')
      .eq('id', boardId)
      .eq('ws_id', wsId)
      .single();

    if (boardCheckError || !board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    if (board.deleted_at) {
      return NextResponse.json(
        { error: 'Board is already in trash' },
        { status: 400 }
      );
    }

    const { error: softDeleteError } = await supabase
      .from('workspace_boards')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', boardId);

    if (softDeleteError) {
      console.error('Error moving board to trash:', softDeleteError);
      return NextResponse.json(
        { error: 'Failed to move board to trash' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in PUT board handler:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
