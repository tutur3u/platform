import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Schema for validating route params
const paramsSchema = z.object({
  wsId: z.string().uuid('Invalid workspace ID'),
  boardId: z.string().uuid('Invalid board ID'),
});

type BoardParams = z.infer<typeof paramsSchema>;

export async function POST(
  _: NextRequest,
  { params }: { params: Promise<BoardParams> }
) {
  try {
    const rawParams = await params;

    // Validate params using Zod schema
    const validation = paramsSchema.safeParse(rawParams);
    if (!validation.success) {
      const errorMessage = validation.error.issues
        .map((e) => e.message)
        .join(', ');
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const { wsId, boardId } = validation.data;

    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to archive boards' },
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

    // Verify board exists and belongs to workspace
    const { data: board, error: boardCheckError } = await supabase
      .from('workspace_boards')
      .select('id, ws_id, archived_at, deleted_at')
      .eq('id', boardId)
      .eq('ws_id', wsId)
      .single();

    if (boardCheckError || !board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    // Check if already archived
    if (board.archived_at) {
      return NextResponse.json(
        { error: 'Board is already archived' },
        { status: 400 }
      );
    }

    // Check if board is deleted
    if (board.deleted_at) {
      return NextResponse.json(
        { error: 'Cannot archive a deleted board' },
        { status: 400 }
      );
    }

    // Archive the board by setting archived_at timestamp
    const { error: archiveError } = await supabase
      .from('workspace_boards')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', boardId);

    if (archiveError) {
      console.error('Supabase error:', archiveError);
      return NextResponse.json(
        { error: 'Failed to archive board' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Board archived successfully',
    });
  } catch (error) {
    console.error('Error archiving board:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<BoardParams> }
) {
  try {
    const rawParams = await params;

    // Validate params using Zod schema
    const validation = paramsSchema.safeParse(rawParams);
    if (!validation.success) {
      const errorMessage = validation.error.issues
        .map((e) => e.message)
        .join(', ');
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const { wsId, boardId } = validation.data;

    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to unarchive boards' },
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

    // Verify board exists and belongs to workspace
    const { data: board, error: boardCheckError } = await supabase
      .from('workspace_boards')
      .select('id, ws_id, archived_at, deleted_at')
      .eq('id', boardId)
      .eq('ws_id', wsId)
      .single();

    if (boardCheckError || !board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    // Check if board is not archived
    if (!board.archived_at) {
      return NextResponse.json(
        { error: 'Board is not archived' },
        { status: 400 }
      );
    }

    // Check if board is deleted
    if (board.deleted_at) {
      return NextResponse.json(
        { error: 'Cannot unarchive a deleted board' },
        { status: 400 }
      );
    }

    // Unarchive the board by setting archived_at to null
    const { error: unarchiveError } = await supabase
      .from('workspace_boards')
      .update({ archived_at: null })
      .eq('id', boardId);

    if (unarchiveError) {
      console.error('Supabase error:', unarchiveError);
      return NextResponse.json(
        { error: 'Failed to unarchive board' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Board unarchived successfully',
    });
  } catch (error) {
    console.error('Error unarchiving board:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
