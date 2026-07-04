import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const paramsSchema = z.object({
  wsId: z.guid(),
  boardId: z.guid(),
});

interface BoardParams {
  wsId: string;
  boardId: string;
}

async function verifyWorkspaceAccess(
  supabase: Parameters<Parameters<typeof withSessionAuth>[0]>[1]['supabase'],
  wsId: string,
  userId: string
) {
  const member = await verifyWorkspaceMembershipType({
    wsId,
    userId,
    supabase,
  });
  return member.ok;
}

// POST handler for archiving
export const POST = withSessionAuth<BoardParams>(
  async (_req, { user, supabase }, rawParams) => {
    try {
      const { wsId, boardId } = paramsSchema.parse(rawParams);

      if (!(await verifyWorkspaceAccess(supabase, wsId, user.id))) {
        return NextResponse.json(
          { error: "You don't have access to this workspace" },
          { status: 403 }
        );
      }

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
);

// DELETE handler for unarchiving
export const DELETE = withSessionAuth<BoardParams>(
  async (_req, { user, supabase }, rawParams) => {
    try {
      const { wsId, boardId } = paramsSchema.parse(rawParams);

      if (!(await verifyWorkspaceAccess(supabase, wsId, user.id))) {
        return NextResponse.json(
          { error: "You don't have access to this workspace" },
          { status: 403 }
        );
      }

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
);
