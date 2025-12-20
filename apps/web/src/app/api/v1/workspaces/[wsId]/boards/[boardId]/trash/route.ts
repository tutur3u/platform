import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import { authorize } from '@/lib/api-auth';

interface BoardParams {
  wsId: string;
  boardId: string;
}

export async function POST(
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

    const { error: authError } = await authorize(wsId);
    if (authError) {
      return authError;
    }

    const supabase = await createClient();

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

    // Check if already in trash
    if (board.deleted_at) {
      return NextResponse.json(
        { error: 'Board is already in trash' },
        { status: 400 }
      );
    }

    // Soft delete the board by setting deleted_at timestamp
    const { error: deleteError } = await supabase
      .from('workspace_boards')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', boardId);

    if (deleteError) {
      console.error('Supabase error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to move board to trash' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Board moved to trash successfully',
    });
  } catch (error) {
    console.error('Error moving board to trash:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
