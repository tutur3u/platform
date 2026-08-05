import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { resolveTaskBoardAccess } from '@tuturuuu/tasks-api/server/board-access';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { type SessionAuthContext, withSessionAuth } from '@/lib/api-auth';

const TASK_BOARD_VIEWABLE_MEMBERS_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'tasks'],
} as const;

const paramsSchema = z.object({
  wsId: z.string().min(1),
  boardId: z.guid(),
});

type ViewableMembersManagerResult =
  | {
      boardId: string;
      sbAdmin: TypedSupabaseClient;
      wsId: string;
    }
  | {
      error: NextResponse;
    };

type FocusedMemberRow = {
  user_id?: string | null;
  display_name?: string | null;
  email?: string | null;
  handle?: string | null;
  avatar_url?: string | null;
  is_creator?: boolean | null;
  permission?: string | null;
  workspace_member_type?: string | null;
  roles?: unknown;
};

function serializeMember(member: FocusedMemberRow) {
  const userId = member.user_id ?? '';
  return {
    id: userId,
    user_id: userId,
    display_name: member.display_name ?? null,
    email: member.email ?? null,
    handle: member.handle ?? null,
    avatar_url: member.avatar_url ?? null,
    is_creator: member.is_creator === true,
    permission: member.permission === 'edit' ? 'edit' : 'view',
    workspace_member_type: member.workspace_member_type ?? null,
    roles: Array.isArray(member.roles)
      ? member.roles.flatMap((role) =>
          role && typeof role.id === 'string' && typeof role.name === 'string'
            ? [{ id: role.id, name: role.name }]
            : []
        )
      : [],
  };
}

async function requireViewableMembersManager({
  boardId,
  rawWsId,
  supabase,
  user,
}: {
  boardId: string;
  rawWsId: string;
  supabase: TypedSupabaseClient;
  user: SessionAuthContext['user'];
}): Promise<ViewableMembersManagerResult> {
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);
  const sbAdmin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const access = await resolveTaskBoardAccess({
    boardId,
    requiredPermission: 'view',
    sbAdmin,
    supabase,
    user,
    wsId,
  });

  if ('error' in access) return access;

  return { boardId: access.boardId, sbAdmin, wsId: access.wsId } as const;
}

export const GET = withSessionAuth<{ wsId: string; boardId: string }>(
  async (_request, { supabase, user }, rawParams) => {
    const startedAt = Date.now();
    try {
      const params = paramsSchema.parse(rawParams);
      const manager = await requireViewableMembersManager({
        boardId: params.boardId,
        rawWsId: params.wsId,
        supabase,
        user,
      });
      if ('error' in manager) return manager.error;

      const { data, error } = await (manager.sbAdmin as any).rpc(
        'get_task_board_workspace_members',
        { p_ws_id: manager.wsId }
      );
      if (error) throw error;
      const workspaceMembers = ((data ?? []) as FocusedMemberRow[])
        .filter((member) => Boolean(member.user_id))
        .map(serializeMember);

      console.info('Task board member access loaded', {
        boardId: manager.boardId,
        durationMs: Date.now() - startedAt,
        memberCount: workspaceMembers.length,
        wsId: manager.wsId,
      });

      return NextResponse.json({
        members: workspaceMembers,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid workspace or board ID' },
          { status: 400 }
        );
      }

      console.error('Error loading task board member access', {
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: TASK_BOARD_VIEWABLE_MEMBERS_APP_SESSION_AUTH }
);
