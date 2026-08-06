import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  resolveTaskBoardAccess,
  type TaskBoardGuestPermission,
} from '@tuturuuu/tasks-api/server/board-access';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  boardId: z.guid(),
});

type PublicLinkRow = {
  board_id: string;
  code: string;
  created_at?: string | null;
  disabled_at?: string | null;
  enabled: boolean;
  id: string;
  updated_at?: string | null;
};

type BoardRow = {
  archived_at?: string | null;
  deleted_at?: string | null;
  id: string;
  ws_id: string;
};

type PublicLinkManagerResult =
  | {
      board: BoardRow;
      boardId: string;
      sbAdmin: TypedSupabaseClient;
      wsId: string;
    }
  | {
      error: NextResponse;
    };

type PublicLinkManager = Extract<PublicLinkManagerResult, { boardId: string }>;

const PUBLIC_LINK_SELECT =
  'id, board_id, code, enabled, disabled_at, created_at, updated_at';

function serializePublicLink(row: PublicLinkRow) {
  return {
    id: row.id,
    board_id: row.board_id,
    code: row.code,
    enabled: row.enabled,
    disabled_at: row.disabled_at ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

async function requirePublicLinkManager({
  boardId,
  rawWsId,
  requiredPermission,
  supabase,
  user,
}: {
  boardId: string;
  rawWsId: string;
  /**
   * Reading who a board is shared with is a member-level question, the same as
   * listing its members. Only changing the sharing needs manage rights.
   */
  requiredPermission: TaskBoardGuestPermission;
  supabase: TypedSupabaseClient;
  user: { id: string };
}): Promise<PublicLinkManagerResult> {
  // Resolve access the way every other board route does. Deriving the
  // workspace from the board itself (via sbAdmin) rather than from the request
  // means a `personal` alias that does not resolve for this user, or a wsId
  // that is not the board's real workspace, no longer decides the answer — and
  // the membership lookup goes through the shared helper instead of the
  // session client, which carries no Supabase auth in a satellite app.
  const wsId = await normalizeWorkspaceId(rawWsId, supabase).catch(
    () => rawWsId
  );
  const sbAdmin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const access = await resolveTaskBoardAccess({
    boardId,
    requiredPermission,
    sbAdmin,
    supabase,
    user: user as never,
    wsId,
  });

  if ('error' in access) return access;

  const { data: board, error: boardError } = await sbAdmin
    .from('workspace_boards')
    .select('id, ws_id, archived_at, deleted_at')
    .eq('id', access.boardId)
    .eq('ws_id', access.wsId)
    .maybeSingle();

  if (boardError) {
    return {
      error: NextResponse.json(
        { error: 'Failed to load task board' },
        { status: 500 }
      ),
    } as const;
  }

  if (!board) {
    return {
      error: NextResponse.json({ error: 'Board not found' }, { status: 404 }),
    } as const;
  }

  return {
    board: board as BoardRow,
    boardId: access.boardId,
    sbAdmin,
    wsId: access.wsId,
  } as const;
}

async function getActivePublicLink(manager: PublicLinkManager) {
  return (manager.sbAdmin as any)
    .from('task_board_public_links')
    .select(PUBLIC_LINK_SELECT)
    .eq('board_id', manager.boardId)
    .eq('enabled', true)
    .maybeSingle();
}

export const GET = withSessionAuth<{ wsId: string; boardId: string }>(
  async (_request, { supabase, user }, rawParams) => {
    try {
      const params = paramsSchema.parse(rawParams);
      const manager = await requirePublicLinkManager({
        boardId: params.boardId,
        requiredPermission: 'view',
        rawWsId: params.wsId,
        supabase,
        user,
      });
      if ('error' in manager) return manager.error;

      const { data, error } = await getActivePublicLink(manager);

      if (error) {
        return NextResponse.json(
          { error: 'Failed to load public board link' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        publicLink: data ? serializePublicLink(data as PublicLinkRow) : null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid workspace or board ID' },
          { status: 400 }
        );
      }

      console.error('Error loading task board public link:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

export const POST = withSessionAuth<{ wsId: string; boardId: string }>(
  async (_request, { supabase, user }, rawParams) => {
    try {
      const params = paramsSchema.parse(rawParams);
      const manager = await requirePublicLinkManager({
        boardId: params.boardId,
        requiredPermission: 'edit',
        rawWsId: params.wsId,
        supabase,
        user,
      });
      if ('error' in manager) return manager.error;

      if (manager.board.deleted_at || manager.board.archived_at) {
        return NextResponse.json(
          { error: 'Archived or deleted boards cannot be shared publicly' },
          { status: 409 }
        );
      }

      const existing = await getActivePublicLink(manager);
      if (existing.error) {
        return NextResponse.json(
          { error: 'Failed to load public board link' },
          { status: 500 }
        );
      }

      if (existing.data) {
        return NextResponse.json({
          publicLink: serializePublicLink(existing.data as PublicLinkRow),
        });
      }

      const { data, error } = await (manager.sbAdmin as any)
        .from('task_board_public_links')
        .insert({
          board_id: manager.boardId,
          created_by_user_id: user.id,
        })
        .select(PUBLIC_LINK_SELECT)
        .maybeSingle();

      if (error || !data) {
        return NextResponse.json(
          { error: 'Failed to create public board link' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        publicLink: serializePublicLink(data as PublicLinkRow),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid workspace or board ID' },
          { status: 400 }
        );
      }

      console.error('Error creating task board public link:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

export const DELETE = withSessionAuth<{ wsId: string; boardId: string }>(
  async (_request, { supabase, user }, rawParams) => {
    try {
      const params = paramsSchema.parse(rawParams);
      const manager = await requirePublicLinkManager({
        boardId: params.boardId,
        requiredPermission: 'edit',
        rawWsId: params.wsId,
        supabase,
        user,
      });
      if ('error' in manager) return manager.error;

      const { error } = await (manager.sbAdmin as any)
        .from('task_board_public_links')
        .update({
          disabled_at: new Date().toISOString(),
          disabled_by_user_id: user.id,
          enabled: false,
        })
        .eq('board_id', manager.boardId)
        .eq('enabled', true);

      if (error) {
        return NextResponse.json(
          { error: 'Failed to disable public board link' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid workspace or board ID' },
          { status: 400 }
        );
      }

      console.error('Error disabling task board public link:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
