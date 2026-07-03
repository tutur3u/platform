import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

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
  supabase,
  user,
}: {
  boardId: string;
  rawWsId: string;
  supabase: TypedSupabaseClient;
  user: { id: string };
}): Promise<PublicLinkManagerResult> {
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);
  const memberCheck = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      ),
    } as const;
  }

  if (!memberCheck.ok) {
    return {
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    } as const;
  }

  const permissions = await getPermissions({ wsId, user });
  if (!permissions?.containsPermission('manage_projects')) {
    return {
      error: NextResponse.json(
        { error: "You don't have permission to perform this operation" },
        { status: 403 }
      ),
    } as const;
  }

  const sbAdmin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const { data: board, error: boardError } = await sbAdmin
    .from('workspace_boards')
    .select('id, ws_id, archived_at, deleted_at')
    .eq('id', boardId)
    .eq('ws_id', wsId)
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

  return { board: board as BoardRow, boardId, sbAdmin, wsId } as const;
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

      serverLogger.error('Error loading task board public link:', error);
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

      serverLogger.error('Error creating task board public link:', error);
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

      serverLogger.error('Error disabling task board public link:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
