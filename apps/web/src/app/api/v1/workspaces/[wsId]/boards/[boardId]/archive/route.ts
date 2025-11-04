import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const paramsSchema = z.object({
  wsId: z.string().uuid(),
  boardId: z.string().uuid(),
});

async function authorize(wsId: string) {
  console.log('Authorizing request for workspace:', wsId);
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error('Error getting user:', userError);
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      ),
    };
  }

  if (!user) {
    console.log('No user found, returning unauthorized');
    return {
      user: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  console.log('User found:', user.id);

  const { data: memberCheck, error: memberError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .single();

  if (memberError) {
    console.error('Error checking workspace membership:', memberError);
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      ),
    };
  }

  if (!memberCheck) {
    console.log('User is not a member of the workspace, returning forbidden');
    return {
      user: null,
      error: NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      ),
    };
  }

  console.log('User is a member of the workspace');
  return { user, error: null };
}

// POST handler for archiving
export async function POST(
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
      .select('id, archived_at, deleted_at')
      .eq('id', boardId)
      .eq('ws_id', wsId)
      .single();

    if (boardCheckError || !board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    if (board.archived_at) {
      return NextResponse.json(
        { error: 'Board is already archived' },
        { status: 400 }
      );
    }

    if (board.deleted_at) {
      return NextResponse.json(
        { error: 'Cannot archive a deleted board' },
        { status: 400 }
      );
    }

    const { error: archiveError } = await supabase
      .from('workspace_boards')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', boardId);

    if (archiveError) {
      console.error('Error archiving board:', archiveError);
      return NextResponse.json(
        { error: 'Failed to archive board' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST archive handler:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE handler for unarchiving
export async function DELETE(
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
      .select('id, archived_at, deleted_at')
      .eq('id', boardId)
      .eq('ws_id', wsId)
      .single();

    if (boardCheckError || !board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    if (!board.archived_at) {
      return NextResponse.json(
        { error: 'Board is not archived' },
        { status: 400 }
      );
    }

    if (board.deleted_at) {
      return NextResponse.json(
        { error: 'Cannot unarchive a deleted board' },
        { status: 400 }
      );
    }

    const { error: unarchiveError } = await supabase
      .from('workspace_boards')
      .update({ archived_at: null })
      .eq('id', boardId);

    if (unarchiveError) {
      console.error('Error unarchiving board:', unarchiveError);
      return NextResponse.json(
        { error: 'Failed to unarchive board' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE archive handler:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
