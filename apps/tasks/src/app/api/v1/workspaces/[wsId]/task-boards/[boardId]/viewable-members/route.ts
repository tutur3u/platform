import { resolveTaskBoardAccess } from '@tuturuuu/apis/tu-do/board-access';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { type SessionAuthContext, withSessionAuth } from '@/lib/api-auth';
import {
  type EnhancedWorkspaceMember,
  getWorkspaceMembers,
} from '@/lib/workspace-members';

const MANAGE_PROJECTS_PERMISSION = 'manage_projects';
const TASK_BOARD_VIEWABLE_MEMBERS_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'tasks'],
} as const;

type BoardSharePermission =
  Database['public']['Tables']['task_board_shares']['Row']['permission'];

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

type ViewableMember = ReturnType<typeof serializeMember>;

type DirectBoardGuestRow = {
  permission?: BoardSharePermission | null;
  shared_with_user_id?: string | null;
  shared_with_email?: string | null;
  users?: {
    avatar_url?: string | null;
    display_name?: string | null;
    handle?: string | null;
    id?: string | null;
  } | null;
};

function memberHasManageProjects(member: EnhancedWorkspaceMember) {
  if (member.direct_board_guest) return true;
  if (member.is_creator) return true;

  const permissions = [
    ...member.default_permissions
      .filter((permission) => permission.enabled)
      .map((permission) => permission.permission),
    ...member.roles.flatMap((role) =>
      role.permissions
        .filter((permission) => permission.enabled)
        .map((permission) => permission.permission)
    ),
  ];

  return (
    permissions.includes('admin') ||
    permissions.includes(MANAGE_PROJECTS_PERMISSION)
  );
}

function serializeMember(member: EnhancedWorkspaceMember) {
  return {
    id: member.id ?? '',
    user_id: member.id ?? '',
    display_name: member.display_name ?? null,
    email: member.email ?? null,
    handle: member.handle ?? null,
    avatar_url: member.avatar_url ?? null,
    is_creator: member.is_creator,
    workspace_member_type: member.workspace_member_type ?? null,
    roles: member.roles.map((role) => ({
      id: role.id,
      name: role.name,
    })),
  };
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

function serializeDirectBoardGuest(row: DirectBoardGuestRow) {
  const userId = row.shared_with_user_id ?? row.users?.id ?? null;
  if (!userId) return null;

  const email = normalizeEmail(row.shared_with_email);

  return {
    id: userId,
    user_id: userId,
    display_name: row.users?.display_name ?? email ?? null,
    email,
    handle: row.users?.handle ?? null,
    avatar_url: row.users?.avatar_url ?? null,
    is_creator: false,
    workspace_member_type: 'GUEST',
    roles: [],
  } satisfies ViewableMember;
}

async function getDirectBoardGuestMembers({
  boardId,
  sbAdmin,
}: {
  boardId: string;
  sbAdmin: TypedSupabaseClient;
}) {
  const { data, error } = await (sbAdmin as any)
    .from('task_board_shares')
    .select(
      'shared_with_user_id, shared_with_email, permission, users:shared_with_user_id(id, display_name, handle, avatar_url)'
    )
    .eq('board_id', boardId)
    .not('shared_with_user_id', 'is', null);

  if (error) throw error;

  return ((data ?? []) as DirectBoardGuestRow[]).flatMap((row) => {
    const member = serializeDirectBoardGuest(row);
    return member ? [member] : [];
  });
}

function mergeMembers(members: ViewableMember[]) {
  const byUserId = new Map<string, ViewableMember>();

  for (const member of members) {
    if (!member.user_id) continue;
    const previous = byUserId.get(member.user_id);

    byUserId.set(member.user_id, {
      ...member,
      display_name: previous?.display_name ?? member.display_name,
      email: previous?.email ?? member.email,
      handle: previous?.handle ?? member.handle,
      avatar_url: previous?.avatar_url ?? member.avatar_url,
      is_creator: previous?.is_creator || member.is_creator,
      roles: previous?.roles.length ? previous.roles : member.roles,
      workspace_member_type:
        previous?.workspace_member_type === 'MEMBER'
          ? previous.workspace_member_type
          : member.workspace_member_type,
    });
  }

  return [...byUserId.values()];
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
    try {
      const params = paramsSchema.parse(rawParams);
      const manager = await requireViewableMembersManager({
        boardId: params.boardId,
        rawWsId: params.wsId,
        supabase,
        user,
      });
      if ('error' in manager) return manager.error;

      const members = await getWorkspaceMembers({
        supabase: manager.sbAdmin,
        sbAdmin: manager.sbAdmin,
        wsId: manager.wsId,
        status: 'joined',
      });
      const workspaceMembers = members
        .filter(
          (member) =>
            member.id &&
            !member.pending &&
            !member.id.startsWith('board-guest:') &&
            memberHasManageProjects(member)
        )
        .map(serializeMember);
      const directBoardGuests = await getDirectBoardGuestMembers({
        boardId: manager.boardId,
        sbAdmin: manager.sbAdmin,
      });

      return NextResponse.json({
        members: mergeMembers([...workspaceMembers, ...directBoardGuests]),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid workspace or board ID' },
          { status: 400 }
        );
      }

      console.error('Error loading task board viewable members:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: TASK_BOARD_VIEWABLE_MEMBERS_APP_SESSION_AUTH }
);
