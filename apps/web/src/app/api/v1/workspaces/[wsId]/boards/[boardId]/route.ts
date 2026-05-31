import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
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

const TASK_BOARD_NAME_EXISTS_CODE = 'TASK_BOARD_NAME_EXISTS';
const TASK_BOARD_NAME_EXISTS_ERROR =
  'A task board with this name already exists';

function isUniqueViolation(error: unknown) {
  return (
    error !== null &&
    error !== undefined &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '23505'
  );
}

function taskBoardNameExistsResponse() {
  return NextResponse.json(
    {
      code: TASK_BOARD_NAME_EXISTS_CODE,
      error: TASK_BOARD_NAME_EXISTS_ERROR,
    },
    { status: 409 }
  );
}

interface BoardParams {
  wsId: string;
  boardId: string;
}

type SessionAuthContext = Parameters<Parameters<typeof withSessionAuth>[0]>[1];

async function requireBoardManagementAccess(
  supabase: SessionAuthContext['supabase'],
  wsId: string,
  user: SessionAuthContext['user']
) {
  const memberCheck = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!memberCheck.ok) {
    return NextResponse.json(
      { error: "You don't have access to this workspace" },
      { status: 403 }
    );
  }

  const permissions = await getPermissions({ wsId, user });
  if (!permissions?.containsPermission('manage_projects')) {
    return NextResponse.json(
      { error: "You don't have permission to perform this operation" },
      { status: 403 }
    );
  }

  return null;
}

// DELETE handler for permanent deletion
export const DELETE = withSessionAuth<BoardParams>(
  async (_req, { user, supabase }, rawParams) => {
    try {
      const rawWsId = paramsSchema.parse(rawParams).wsId;
      const { boardId } = paramsSchema.parse(rawParams);
      const wsId = await normalizeWorkspaceId(rawWsId, supabase);

      const accessError = await requireBoardManagementAccess(
        supabase,
        wsId,
        user
      );
      if (accessError) return accessError;

      const sbAdmin = await createAdminClient();

      const { data: board, error: boardCheckError } = await sbAdmin
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

      const { error: deleteError } = await sbAdmin
        .from('workspace_boards')
        .delete()
        .eq('id', boardId)
        .eq('ws_id', wsId);

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
);

// PATCH handler for restoration
const restoreBodySchema = z.object({
  restore: z.boolean(),
});

export const PATCH = withSessionAuth<BoardParams>(
  async (req, { user, supabase }, rawParams) => {
    try {
      const rawWsId = paramsSchema.parse(rawParams).wsId;
      const { boardId } = paramsSchema.parse(rawParams);
      const wsId = await normalizeWorkspaceId(rawWsId, supabase);

      const accessError = await requireBoardManagementAccess(
        supabase,
        wsId,
        user
      );
      if (accessError) return accessError;

      const body = await req.json();
      const { restore } = restoreBodySchema.parse(body);

      if (!restore) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
      }

      const sbAdmin = await createAdminClient();

      const { data: board, error: boardCheckError } = await sbAdmin
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

      const { error: restoreError } = await sbAdmin
        .from('workspace_boards')
        .update({ deleted_at: null })
        .eq('id', boardId)
        .eq('ws_id', wsId);

      if (restoreError) {
        if (isUniqueViolation(restoreError)) {
          return taskBoardNameExistsResponse();
        }

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
);

// PUT handler for soft deletion (moving to trash)
export const PUT = withSessionAuth<BoardParams>(
  async (_req, { user, supabase }, rawParams) => {
    try {
      const rawWsId = paramsSchema.parse(rawParams).wsId;
      const { boardId } = paramsSchema.parse(rawParams);
      const wsId = await normalizeWorkspaceId(rawWsId, supabase);

      const accessError = await requireBoardManagementAccess(
        supabase,
        wsId,
        user
      );
      if (accessError) return accessError;

      const sbAdmin = await createAdminClient();

      const { data: board, error: boardCheckError } = await sbAdmin
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

      const { error: softDeleteError } = await sbAdmin
        .from('workspace_boards')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', boardId)
        .eq('ws_id', wsId);

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
);
