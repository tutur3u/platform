import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  boardId: z.guid(),
});

interface BoardParams {
  wsId: string;
  boardId: string;
}

async function requireWorkspaceAccess(
  supabase: Parameters<Parameters<typeof withSessionAuth>[0]>[1]['supabase'],
  wsId: string,
  userId: string
) {
  const member = await verifyWorkspaceMembershipType({
    wsId,
    userId,
    supabase,
  });

  if (member.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!member.ok) {
    return NextResponse.json(
      { error: "You don't have access to this workspace" },
      { status: 403 }
    );
  }

  return null;
}

// POST handler for archiving
export const POST = withSessionAuth<BoardParams>(
  async (_req, { user, supabase }, rawParams) => {
    try {
      const { wsId: rawWsId, boardId } = paramsSchema.parse(rawParams);
      const wsId = await normalizeWorkspaceId(rawWsId, supabase);

      const accessError = await requireWorkspaceAccess(supabase, wsId, user.id);
      if (accessError) return accessError;

      const sbAdmin = await createAdminClient();

      const { data: board, error: boardCheckError } = await sbAdmin
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

      const { error: archiveError } = await sbAdmin
        .from('workspace_boards')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', boardId)
        .eq('ws_id', wsId);

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
      const { wsId: rawWsId, boardId } = paramsSchema.parse(rawParams);
      const wsId = await normalizeWorkspaceId(rawWsId, supabase);

      const accessError = await requireWorkspaceAccess(supabase, wsId, user.id);
      if (accessError) return accessError;

      const sbAdmin = await createAdminClient();

      const { data: board, error: boardCheckError } = await sbAdmin
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

      const { error: unarchiveError } = await sbAdmin
        .from('workspace_boards')
        .update({ archived_at: null })
        .eq('id', boardId)
        .eq('ws_id', wsId);

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
