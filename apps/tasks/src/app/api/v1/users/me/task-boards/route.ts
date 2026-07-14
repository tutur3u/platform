import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  normalizeTaskBoardShareEmail,
  strongestTaskBoardGuestPermission,
  type TaskBoardGuestPermission,
} from '@tuturuuu/tasks-api/server/board-access';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

type WorkspaceJoinRow = {
  avatar_url?: string | null;
  creator_id?: string | null;
  id?: string | null;
  logo_url?: string | null;
  name?: string | null;
  personal?: boolean | null;
};

type BoardJoinRow = {
  archived_at?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
  icon?: string | null;
  id?: string | null;
  name?: string | null;
  ticket_prefix?: string | null;
  workspaces?: WorkspaceJoinRow | WorkspaceJoinRow[] | null;
  ws_id?: string | null;
};

type MemberWorkspaceRow = {
  workspaces?: WorkspaceJoinRow | WorkspaceJoinRow[] | null;
  ws_id?: string | null;
};

type GuestShareRow = {
  board_id?: string | null;
  permission?: TaskBoardGuestPermission | null;
  workspace_boards?: BoardJoinRow | BoardJoinRow[] | null;
};

type AccessibleTaskBoard = {
  access_type: 'member' | 'guest';
  archived_at: string | null;
  created_at: string | null;
  deleted_at: string | null;
  guest_permission: TaskBoardGuestPermission | null;
  icon: string | null;
  id: string;
  name: string | null;
  ticket_prefix: string | null;
  workspace: InternalApiWorkspaceSummary;
  ws_id: string;
};

const ACTIVE_BOARD_SELECT = `
  id,
  ws_id,
  name,
  icon,
  ticket_prefix,
  archived_at,
  deleted_at,
  created_at,
  workspaces!inner (
    id,
    name,
    personal,
    avatar_url,
    logo_url,
    creator_id
  )
`;

function joinedOne<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeWorkspaceSummary({
  accessType,
  guestBoardCount,
  guestHighestPermission,
  user,
  workspace,
}: {
  accessType: 'member' | 'guest';
  guestBoardCount?: number;
  guestHighestPermission?: TaskBoardGuestPermission | null;
  user: SupabaseUser;
  workspace: WorkspaceJoinRow;
}): InternalApiWorkspaceSummary | null {
  if (!workspace.id) return null;

  return {
    id: workspace.id,
    name: workspace.name || (workspace.personal ? 'Personal' : 'Untitled'),
    personal: workspace.personal ?? false,
    avatar_url: workspace.avatar_url ?? null,
    logo_url: workspace.logo_url ?? null,
    created_by_me: workspace.creator_id === user.id,
    access_type: accessType,
    ...(accessType === 'guest'
      ? {
          guest_board_count: guestBoardCount ?? 1,
          guest_highest_permission: guestHighestPermission ?? null,
          guest_landing_path: guestBoardCount === 1 ? null : '/tasks/boards',
          guest_products: ['tasks' as const],
        }
      : {}),
  };
}

function normalizeBoard({
  accessType,
  guestPermission,
  user,
  workspace,
  row,
}: {
  accessType: 'member' | 'guest';
  guestPermission?: TaskBoardGuestPermission | null;
  user: SupabaseUser;
  workspace: WorkspaceJoinRow;
  row: BoardJoinRow;
}): AccessibleTaskBoard | null {
  if (!row.id || !row.ws_id) return null;

  const workspaceSummary = normalizeWorkspaceSummary({
    accessType,
    guestHighestPermission: guestPermission ?? null,
    user,
    workspace,
  });
  if (!workspaceSummary) return null;

  return {
    id: row.id,
    ws_id: row.ws_id,
    name: row.name ?? null,
    icon: row.icon ?? null,
    ticket_prefix: row.ticket_prefix ?? null,
    archived_at: row.archived_at ?? null,
    deleted_at: row.deleted_at ?? null,
    created_at: row.created_at ?? null,
    access_type: accessType,
    guest_permission:
      accessType === 'guest' ? (guestPermission ?? 'view') : null,
    workspace: workspaceSummary,
  };
}

async function getUserEmail(sbAdmin: TypedSupabaseClient, user: SupabaseUser) {
  const authEmail = normalizeTaskBoardShareEmail(user.email);
  if (authEmail) return authEmail;

  const { data } = await sbAdmin
    .from('user_private_details')
    .select('email')
    .eq('user_id', user.id)
    .maybeSingle();

  return normalizeTaskBoardShareEmail(
    (data as { email?: string | null } | null)?.email
  );
}

async function getManagedWorkspaceIds({
  rows,
  user,
}: {
  rows: MemberWorkspaceRow[];
  user: SupabaseUser;
}) {
  const uniqueWorkspaceIds = [
    ...new Set(
      rows
        .map((row) => row.ws_id ?? joinedOne(row.workspaces)?.id ?? null)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const permissionResults = await Promise.all(
    uniqueWorkspaceIds.map(async (wsId) => {
      const permissions = await getPermissions({ wsId, user });
      return {
        canManageProjects:
          permissions?.containsPermission('manage_projects') ?? false,
        wsId,
      };
    })
  );

  return new Set(
    permissionResults
      .filter((result) => result.canManageProjects)
      .map((result) => result.wsId)
  );
}

async function loadGuestShareRows({
  email,
  sbAdmin,
  userId,
}: {
  email: string | null;
  sbAdmin: TypedSupabaseClient;
  userId: string;
}) {
  const rows: GuestShareRow[] = [];
  const select = `
    board_id,
    permission,
    workspace_boards!inner (
      ${ACTIVE_BOARD_SELECT}
    )
  `;

  const applyBoardFilters = (query: any) =>
    query
      .select(select)
      .is('workspace_boards.deleted_at', null)
      .is('workspace_boards.archived_at', null);

  const userResult = await applyBoardFilters(
    (sbAdmin as any).from('task_board_shares')
  ).eq('shared_with_user_id', userId);
  if (userResult.error) throw new Error('TASK_BOARD_SHARE_QUERY_FAILED');
  rows.push(...((userResult.data ?? []) as GuestShareRow[]));

  if (email) {
    const emailResult = await applyBoardFilters(
      (sbAdmin as any).from('task_board_shares')
    ).eq('shared_with_email', email);
    if (emailResult.error) throw new Error('TASK_BOARD_SHARE_QUERY_FAILED');
    rows.push(...((emailResult.data ?? []) as GuestShareRow[]));
  }

  return rows;
}

export const GET = withSessionAuth(async (_request, { user }) => {
  try {
    const sbAdmin = (await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient;

    const { data: memberWorkspaceRows, error: memberWorkspaceError } =
      await sbAdmin
        .from('workspace_members')
        .select(
          `
          ws_id,
          workspaces!inner (
            id,
            name,
            personal,
            avatar_url,
            logo_url,
            creator_id
          )
        `
        )
        .eq('user_id', user.id);

    if (memberWorkspaceError) {
      return NextResponse.json(
        { error: 'Failed to fetch workspace access' },
        { status: 500 }
      );
    }

    const workspaceRows = (memberWorkspaceRows ?? []) as MemberWorkspaceRow[];
    const managedWorkspaceIds = await getManagedWorkspaceIds({
      rows: workspaceRows,
      user,
    });

    const boardsById = new Map<string, AccessibleTaskBoard>();

    if (managedWorkspaceIds.size > 0) {
      const { data: memberBoards, error: memberBoardsError } = await sbAdmin
        .from('workspace_boards')
        .select(ACTIVE_BOARD_SELECT)
        .in('ws_id', [...managedWorkspaceIds])
        .is('archived_at', null)
        .is('deleted_at', null);

      if (memberBoardsError) {
        return NextResponse.json(
          { error: 'Failed to fetch accessible task boards' },
          { status: 500 }
        );
      }

      for (const row of (memberBoards ?? []) as BoardJoinRow[]) {
        const workspace = joinedOne(row.workspaces);
        if (!workspace) continue;

        const board = normalizeBoard({
          accessType: 'member',
          row,
          user,
          workspace,
        });
        if (board) boardsById.set(board.id, board);
      }
    }

    const guestRows = await loadGuestShareRows({
      email: await getUserEmail(sbAdmin, user),
      sbAdmin,
      userId: user.id,
    });
    const guestPermissionsByBoardId = new Map<
      string,
      TaskBoardGuestPermission
    >();

    for (const row of guestRows) {
      if (!row.board_id || !row.permission) continue;
      guestPermissionsByBoardId.set(
        row.board_id,
        strongestTaskBoardGuestPermission([
          guestPermissionsByBoardId.get(row.board_id),
          row.permission,
        ]) ?? row.permission
      );
    }

    for (const row of guestRows) {
      const boardRow = joinedOne(row.workspace_boards);
      const boardId = row.board_id ?? boardRow?.id ?? null;
      if (!boardId || !row.permission || !boardRow || boardsById.has(boardId)) {
        continue;
      }

      const workspace = joinedOne(boardRow.workspaces);
      if (!workspace) continue;

      const board = normalizeBoard({
        accessType: 'guest',
        guestPermission:
          guestPermissionsByBoardId.get(boardId) ?? row.permission,
        row: boardRow,
        user,
        workspace,
      });
      if (board) boardsById.set(board.id, board);
    }

    const boards = [...boardsById.values()].sort((a, b) => {
      const workspaceDelta = (a.workspace.name ?? '').localeCompare(
        b.workspace.name ?? ''
      );
      if (workspaceDelta !== 0) return workspaceDelta;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });

    return NextResponse.json({ boards });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
