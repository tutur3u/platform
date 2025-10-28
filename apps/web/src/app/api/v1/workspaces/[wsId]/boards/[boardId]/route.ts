import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';

interface BoardParams {
  wsId: string;
  boardId: string;
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<BoardParams> }
) {
  try {
    const { wsId, boardId } = await params;

    // Validate UUIDs
    if (!validate(wsId) || !validate(boardId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or board ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to permanently delete boards' },
        { status: 401 }
      );
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    // Verify board exists, belongs to workspace, and is already soft-deleted
    const { data: board, error: boardCheckError } = await supabase
      .from('workspace_boards')
      .select('id, ws_id, deleted_at')
      .eq('id', boardId)
      .eq('ws_id', wsId)
      .single();

    if (boardCheckError || !board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    // Only allow permanent deletion if board is already soft-deleted
    if (!board.deleted_at) {
      return NextResponse.json(
        {
          error:
            'Board must be moved to trash first. Please move the board to trash before permanently deleting it.',
        },
        { status: 400 }
      );
    }

    // Permanently delete the board from database
    const { error: deleteError } = await supabase
      .from('workspace_boards')
      .delete()
      .eq('id', boardId);

    if (deleteError) {
      console.error('Supabase error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to permanently delete board' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Board permanently deleted',
    });
  } catch (error) {
    console.error('Error permanently deleting board:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<BoardParams> }
) {
  try {
    const { wsId, boardId } = await params;

    // Validate UUIDs
    if (!validate(wsId) || !validate(boardId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or board ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to restore boards' },
        { status: 401 }
      );
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { restore } = body;

    if (restore !== true) {
      return NextResponse.json(
        { error: 'Invalid request. Use restore: true to restore a board' },
        { status: 400 }
      );
    }

    // Verify board exists and belongs to workspace
    const { data: board, error: boardCheckError } = await supabase
      .from('workspace_boards')
      .select('id, ws_id, deleted_at')
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

    // Restore the board by setting deleted_at to null
    const { error: restoreError } = await supabase
      .from('workspace_boards')
      .update({ deleted_at: null })
      .eq('id', boardId);

    if (restoreError) {
      console.error('Supabase error:', restoreError);
      return NextResponse.json(
        { error: 'Failed to restore board' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Board restored successfully',
    });
  } catch (error) {
    console.error('Error restoring board:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
