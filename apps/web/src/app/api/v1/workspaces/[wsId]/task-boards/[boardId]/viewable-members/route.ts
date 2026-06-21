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
import {
  type EnhancedWorkspaceMember,
  getWorkspaceMembers,
} from '@/lib/workspace-members';

const MANAGE_PROJECTS_PERMISSION = 'manage_projects';

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

function memberHasManageProjects(member: EnhancedWorkspaceMember) {
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

async function requireViewableMembersManager({
  boardId,
  rawWsId,
  supabase,
  user,
}: {
  boardId: string;
  rawWsId: string;
  supabase: TypedSupabaseClient;
  user: { id: string };
}): Promise<ViewableMembersManagerResult> {
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
  if (!permissions?.containsPermission(MANAGE_PROJECTS_PERMISSION)) {
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

      return NextResponse.json({
        members: members
          .filter((member) => member.id && memberHasManageProjects(member))
          .map(serializeMember),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid workspace or board ID' },
          { status: 400 }
        );
      }

      serverLogger.error('Error loading task board viewable members:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
