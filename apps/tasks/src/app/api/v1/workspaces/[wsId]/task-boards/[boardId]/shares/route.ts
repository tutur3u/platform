import {
  normalizeTaskBoardShareEmail,
  type TaskBoardGuestPermission,
} from '@tuturuuu/apis/tu-do/board-access';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  boardId: z.guid(),
});

const createShareSchema = z.object({
  email: z.email(),
  permission: z.enum(['view', 'edit']).default('view'),
});

const updateShareSchema = z.object({
  shareId: z.guid(),
  permission: z.enum(['view', 'edit']),
});

type ShareRow = {
  created_at?: string | null;
  id: string;
  permission: TaskBoardGuestPermission;
  shared_with_email?: string | null;
  shared_with_user_id?: string | null;
  users?: {
    avatar_url?: string | null;
    display_name?: string | null;
    handle?: string | null;
    id?: string | null;
  } | null;
};

type ExistingShareRow = {
  id: string;
};

type BoardShareManagerResult =
  | {
      boardId: string;
      sbAdmin: TypedSupabaseClient;
      wsId: string;
    }
  | {
      error: NextResponse;
    };

type BoardShareManager = Extract<BoardShareManagerResult, { boardId: string }>;

const BOARD_SHARE_SELECT =
  'id, shared_with_user_id, shared_with_email, permission, created_at, users:shared_with_user_id(id, display_name, handle, avatar_url)';

async function findExistingBoardShare(
  manager: BoardShareManager,
  column: 'shared_with_user_id' | 'shared_with_email',
  value: string
) {
  const { data, error } = await (manager.sbAdmin as any)
    .from('task_board_shares')
    .select('id')
    .eq('board_id', manager.boardId)
    .eq(column, value)
    .limit(1);

  if (error) return { data: null, error };

  return {
    data: ((data ?? []) as ExistingShareRow[])[0] ?? null,
    error: null,
  };
}

async function requireBoardShareManager({
  boardId,
  rawWsId,
  supabase,
  user,
}: {
  boardId: string;
  rawWsId: string;
  supabase: TypedSupabaseClient;
  user: { id: string };
}): Promise<BoardShareManagerResult> {
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
    .select('id, ws_id')
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

  return { boardId, sbAdmin, wsId } as const;
}

function serializeShare(row: ShareRow) {
  return {
    id: row.id,
    email: row.shared_with_email ?? null,
    user_id: row.shared_with_user_id ?? null,
    permission: row.permission,
    created_at: row.created_at ?? null,
    user: row.users
      ? {
          id: row.users.id ?? row.shared_with_user_id ?? null,
          display_name: row.users.display_name ?? null,
          handle: row.users.handle ?? null,
          avatar_url: row.users.avatar_url ?? null,
        }
      : null,
  };
}

export const GET = withSessionAuth<{ wsId: string; boardId: string }>(
  async (_request, { supabase, user }, rawParams) => {
    try {
      const params = paramsSchema.parse(rawParams);
      const manager = await requireBoardShareManager({
        boardId: params.boardId,
        rawWsId: params.wsId,
        supabase,
        user,
      });
      if ('error' in manager) return manager.error;

      const { data, error } = await (manager.sbAdmin as any)
        .from('task_board_shares')
        .select(BOARD_SHARE_SELECT)
        .eq('board_id', manager.boardId)
        .order('created_at', { ascending: false });

      if (error) {
        return NextResponse.json(
          { error: 'Failed to load board shares' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        shares: ((data ?? []) as ShareRow[]).map(serializeShare),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid workspace or board ID' },
          { status: 400 }
        );
      }

      serverLogger.error('Error loading task board shares:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

export const POST = withSessionAuth<{ wsId: string; boardId: string }>(
  async (request, { supabase, user }, rawParams) => {
    try {
      const params = paramsSchema.parse(rawParams);
      const manager = await requireBoardShareManager({
        boardId: params.boardId,
        rawWsId: params.wsId,
        supabase,
        user,
      });
      if ('error' in manager) return manager.error;

      const body = createShareSchema.parse(await request.json());
      const email = normalizeTaskBoardShareEmail(body.email);
      if (!email) {
        return NextResponse.json(
          { error: 'Invalid recipient email' },
          { status: 400 }
        );
      }

      const { data: targetUser } = await manager.sbAdmin
        .from('user_private_details')
        .select('user_id')
        .eq('email', email)
        .maybeSingle();
      const targetUserId =
        (targetUser as { user_id?: string | null } | null)?.user_id ?? null;

      const existingByUser = targetUserId
        ? await findExistingBoardShare(
            manager,
            'shared_with_user_id',
            targetUserId
          )
        : { data: null, error: null };

      if (existingByUser.error) {
        return NextResponse.json(
          { error: 'Failed to check existing board share' },
          { status: 500 }
        );
      }

      const existingByEmail = await findExistingBoardShare(
        manager,
        'shared_with_email',
        email
      );

      if (existingByEmail.error) {
        return NextResponse.json(
          { error: 'Failed to check existing board share' },
          { status: 500 }
        );
      }

      const existingShareId =
        existingByUser.data?.id ?? existingByEmail.data?.id ?? null;

      const payload = {
        board_id: manager.boardId,
        permission: body.permission,
        shared_by_user_id: user.id,
        shared_with_email: email,
        shared_with_user_id: targetUserId,
      };

      const query = existingShareId
        ? (manager.sbAdmin as any)
            .from('task_board_shares')
            .update(payload)
            .eq('id', existingShareId)
        : (manager.sbAdmin as any).from('task_board_shares').insert(payload);

      const { data, error } = await query
        .select(BOARD_SHARE_SELECT)
        .maybeSingle();

      if (error || !data) {
        return NextResponse.json(
          { error: 'Failed to save board share' },
          { status: 500 }
        );
      }

      return NextResponse.json({ share: serializeShare(data as ShareRow) });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'Invalid request payload' },
          { status: 400 }
        );
      }

      serverLogger.error('Error saving task board share:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

export const PATCH = withSessionAuth<{ wsId: string; boardId: string }>(
  async (request, { supabase, user }, rawParams) => {
    try {
      const params = paramsSchema.parse(rawParams);
      const manager = await requireBoardShareManager({
        boardId: params.boardId,
        rawWsId: params.wsId,
        supabase,
        user,
      });
      if ('error' in manager) return manager.error;

      const body = updateShareSchema.parse(await request.json());
      const { data, error } = await (manager.sbAdmin as any)
        .from('task_board_shares')
        .update({ permission: body.permission })
        .eq('id', body.shareId)
        .eq('board_id', manager.boardId)
        .select(BOARD_SHARE_SELECT)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { error: 'Failed to update board share' },
          { status: 500 }
        );
      }

      if (!data) {
        return NextResponse.json({ error: 'Share not found' }, { status: 404 });
      }

      return NextResponse.json({ share: serializeShare(data as ShareRow) });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'Invalid request payload' },
          { status: 400 }
        );
      }

      serverLogger.error('Error updating task board share:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

export const DELETE = withSessionAuth<{ wsId: string; boardId: string }>(
  async (request: NextRequest, { supabase, user }, rawParams) => {
    try {
      const params = paramsSchema.parse(rawParams);
      const manager = await requireBoardShareManager({
        boardId: params.boardId,
        rawWsId: params.wsId,
        supabase,
        user,
      });
      if ('error' in manager) return manager.error;

      const shareId = request.nextUrl.searchParams.get('shareId');
      const parsedShareId = z.guid().safeParse(shareId);
      if (!parsedShareId.success) {
        return NextResponse.json(
          { error: 'Invalid share ID' },
          { status: 400 }
        );
      }

      const { error } = await (manager.sbAdmin as any)
        .from('task_board_shares')
        .delete()
        .eq('id', parsedShareId.data)
        .eq('board_id', manager.boardId);

      if (error) {
        return NextResponse.json(
          { error: 'Failed to remove board share' },
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

      serverLogger.error('Error removing task board share:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
