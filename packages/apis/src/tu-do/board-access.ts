import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getPermissions,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export type TaskBoardGuestPermission = 'view' | 'edit';
export type TaskBoardAccessMode = 'member' | 'guest';

export interface TaskBoardGuestShare {
  board: {
    archived_at?: string | null;
    created_at?: string | null;
    deleted_at?: string | null;
    id: string;
    name?: string | null;
    ws_id: string;
  };
  board_id: string;
  created_at?: string | null;
  id: string;
  permission: TaskBoardGuestPermission;
  shared_with_email?: string | null;
  shared_with_user_id?: string | null;
}

export type TaskBoardAccess =
  | {
      mode: 'member';
      permission: TaskBoardGuestPermission;
    }
  | {
      mode: 'guest';
      permission: TaskBoardGuestPermission;
      share: TaskBoardGuestShare;
    };

export type ResolveTaskBoardAccessResult =
  | {
      access: TaskBoardAccess;
      board: { id: string; ws_id: string };
      boardId: string;
      list?: { board_id: string; id: string };
      listId?: string;
      sbAdmin: TypedSupabaseClient;
      supabase: TypedSupabaseClient;
      taskId?: string;
      user: SupabaseUser;
      wsId: string;
    }
  | {
      error: NextResponse;
    };

type RawTaskBoardShareRow = {
  board_id: string | null;
  created_at?: string | null;
  id: string;
  permission: TaskBoardGuestPermission | null;
  shared_with_email?: string | null;
  shared_with_user_id?: string | null;
  workspace_boards?:
    | {
        archived_at?: string | null;
        created_at?: string | null;
        deleted_at?: string | null;
        id?: string | null;
        name?: string | null;
        ws_id?: string | null;
      }
    | Array<{
        archived_at?: string | null;
        created_at?: string | null;
        deleted_at?: string | null;
        id?: string | null;
        name?: string | null;
        ws_id?: string | null;
      }>
    | null;
};

type BoardContext =
  | {
      board: { id: string; ws_id: string };
      boardId: string;
      list?: { board_id: string; id: string };
      listId?: string;
      taskId?: string;
      wsId: string;
    }
  | {
      error: NextResponse;
    };

export function normalizeTaskBoardShareEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

export function canEditTaskBoardAccess(access: TaskBoardAccess) {
  return access.permission === 'edit';
}

export function strongestTaskBoardGuestPermission(
  permissions: Array<TaskBoardGuestPermission | null | undefined>
): TaskBoardGuestPermission | null {
  if (permissions.includes('edit')) return 'edit';
  if (permissions.includes('view')) return 'view';
  return null;
}

function comparePermission(
  permission: TaskBoardGuestPermission | null | undefined
) {
  return permission === 'edit' ? 2 : permission === 'view' ? 1 : 0;
}

function getJoinedBoard(row: RawTaskBoardShareRow) {
  const joined = row.workspace_boards;
  return Array.isArray(joined) ? joined[0] : joined;
}

function normalizeShareRow(row: RawTaskBoardShareRow) {
  const board = getJoinedBoard(row);

  if (
    !row.id ||
    !row.board_id ||
    !row.permission ||
    !board?.id ||
    !board.ws_id
  ) {
    return null;
  }

  return {
    id: row.id,
    board_id: row.board_id,
    permission: row.permission,
    shared_with_email: row.shared_with_email ?? null,
    shared_with_user_id: row.shared_with_user_id ?? null,
    created_at: row.created_at ?? null,
    board: {
      id: board.id,
      ws_id: board.ws_id,
      name: board.name ?? null,
      archived_at: board.archived_at ?? null,
      deleted_at: board.deleted_at ?? null,
      created_at: board.created_at ?? null,
    },
  } satisfies TaskBoardGuestShare;
}

async function getUserPrivateEmail(
  sbAdmin: TypedSupabaseClient,
  user: Pick<SupabaseUser, 'email' | 'id'>
) {
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

async function queryTaskBoardShares({
  boardIds,
  email,
  sbAdmin,
  userId,
  workspaceId,
}: {
  boardIds?: string[];
  email?: string | null;
  sbAdmin: TypedSupabaseClient;
  userId: string;
  workspaceId: string;
}) {
  const rows: RawTaskBoardShareRow[] = [];
  const select = `
    id,
    board_id,
    shared_with_user_id,
    shared_with_email,
    permission,
    created_at,
    workspace_boards!inner (
      id,
      ws_id,
      name,
      archived_at,
      deleted_at,
      created_at
    )
  `;

  const applyBaseFilters = (query: any) => {
    let filtered = query
      .select(select)
      .eq('workspace_boards.ws_id', workspaceId)
      .is('workspace_boards.deleted_at', null);

    if (boardIds && boardIds.length > 0) {
      filtered = filtered.in('board_id', [...new Set(boardIds)]);
    }

    return filtered;
  };

  const userQuery = applyBaseFilters(
    (sbAdmin as any).from('task_board_shares')
  ).eq('shared_with_user_id', userId);
  const userResult = await userQuery;
  if (userResult.error) throw new Error('TASK_BOARD_SHARE_QUERY_FAILED');
  rows.push(...((userResult.data ?? []) as RawTaskBoardShareRow[]));

  const normalizedEmail = normalizeTaskBoardShareEmail(email);
  if (normalizedEmail) {
    const emailQuery = applyBaseFilters(
      (sbAdmin as any).from('task_board_shares')
    ).eq('shared_with_email', normalizedEmail);
    const emailResult = await emailQuery;
    if (emailResult.error) throw new Error('TASK_BOARD_SHARE_QUERY_FAILED');
    rows.push(...((emailResult.data ?? []) as RawTaskBoardShareRow[]));
  }

  const byId = new Map<string, TaskBoardGuestShare>();

  for (const row of rows) {
    const share = normalizeShareRow(row);
    if (!share) continue;

    const previous = byId.get(share.id);
    if (
      !previous ||
      comparePermission(share.permission) >
        comparePermission(previous.permission)
    ) {
      byId.set(share.id, share);
    }
  }

  return [...byId.values()].sort((a, b) => {
    const byName = (a.board.name ?? '').localeCompare(b.board.name ?? '');
    if (byName !== 0) return byName;
    return (
      new Date(b.created_at ?? 0).getTime() -
      new Date(a.created_at ?? 0).getTime()
    );
  });
}

export async function loadTaskBoardGuestSharesForWorkspace({
  email,
  sbAdmin,
  user,
  workspaceId,
}: {
  email?: string | null;
  sbAdmin: TypedSupabaseClient;
  user: Pick<SupabaseUser, 'email' | 'id'>;
  workspaceId: string;
}) {
  const recipientEmail =
    normalizeTaskBoardShareEmail(email) ??
    (await getUserPrivateEmail(sbAdmin, user));

  return queryTaskBoardShares({
    email: recipientEmail,
    sbAdmin,
    userId: user.id,
    workspaceId,
  });
}

export async function loadTaskBoardGuestSharesForBoard({
  boardId,
  email,
  sbAdmin,
  user,
  workspaceId,
}: {
  boardId: string;
  email?: string | null;
  sbAdmin: TypedSupabaseClient;
  user: Pick<SupabaseUser, 'email' | 'id'>;
  workspaceId: string;
}) {
  const recipientEmail =
    normalizeTaskBoardShareEmail(email) ??
    (await getUserPrivateEmail(sbAdmin, user));

  return queryTaskBoardShares({
    boardIds: [boardId],
    email: recipientEmail,
    sbAdmin,
    userId: user.id,
    workspaceId,
  });
}

export function summarizeTaskBoardGuestShares(shares: TaskBoardGuestShare[]) {
  const boardIds = [...new Set(shares.map((share) => share.board_id))];
  return {
    boardIds,
    boardCount: boardIds.length,
    highestPermission: strongestTaskBoardGuestPermission(
      shares.map((share) => share.permission)
    ),
    landingPath:
      boardIds.length === 1 ? `/tasks/boards/${boardIds[0]}` : '/tasks/boards',
  };
}

async function loadBoardContext({
  boardId,
  listId,
  sbAdmin,
  taskId,
  wsId,
}: {
  boardId?: string | null;
  listId?: string | null;
  sbAdmin: TypedSupabaseClient;
  taskId?: string | null;
  wsId: string;
}): Promise<BoardContext> {
  if (taskId) {
    const { data, error } = await sbAdmin
      .from('tasks')
      .select(
        `
        id,
        list_id,
        task_lists!inner (
          id,
          board_id,
          workspace_boards!inner (
            id,
            ws_id
          )
        )
      `
      )
      .eq('id', taskId)
      .maybeSingle();

    if (error) {
      return {
        error: NextResponse.json(
          { error: 'Failed to load task board access' },
          { status: 500 }
        ),
      };
    }

    const task = data as {
      list_id?: string | null;
      task_lists?: {
        id?: string | null;
        board_id?: string | null;
        workspace_boards?: { id?: string | null; ws_id?: string | null } | null;
      } | null;
    } | null;
    const list = task?.task_lists;
    const board = list?.workspace_boards;

    if (!list?.id || !list.board_id || !board?.id || !board.ws_id) {
      return {
        error: NextResponse.json({ error: 'Task not found' }, { status: 404 }),
      };
    }

    return {
      board: { id: board.id, ws_id: board.ws_id },
      boardId: board.id,
      list: { id: list.id, board_id: list.board_id },
      listId: list.id,
      taskId,
      wsId: board.ws_id,
    };
  }

  if (listId) {
    const { data, error } = await sbAdmin
      .from('task_lists')
      .select('id, board_id, workspace_boards!inner(id, ws_id)')
      .eq('id', listId)
      .maybeSingle();

    if (error) {
      return {
        error: NextResponse.json(
          { error: 'Failed to load task list access' },
          { status: 500 }
        ),
      };
    }

    const list = data as {
      board_id?: string | null;
      id?: string | null;
      workspace_boards?: { id?: string | null; ws_id?: string | null } | null;
    } | null;
    const board = list?.workspace_boards;

    if (!list?.id || !list.board_id || !board?.id || !board.ws_id) {
      return {
        error: NextResponse.json(
          { error: 'Task list not found' },
          { status: 404 }
        ),
      };
    }

    return {
      board: { id: board.id, ws_id: board.ws_id },
      boardId: board.id,
      list: { id: list.id, board_id: list.board_id },
      listId: list.id,
      wsId: board.ws_id,
    };
  }

  if (!boardId) {
    return {
      error: NextResponse.json(
        { error: 'Board access requires a board, list, or task scope' },
        { status: 403 }
      ),
    };
  }

  const { data: board, error } = await sbAdmin
    .from('workspace_boards')
    .select('id, ws_id')
    .eq('id', boardId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: 'Failed to load task board' },
        { status: 500 }
      ),
    };
  }

  if (!board?.id || !board.ws_id) {
    return {
      error: NextResponse.json({ error: 'Board not found' }, { status: 404 }),
    };
  }

  return {
    board,
    boardId: board.id,
    wsId: board.ws_id || wsId,
  };
}

export async function resolveTaskBoardAccess({
  boardId,
  listId,
  requiredPermission = 'view',
  sbAdmin,
  supabase,
  taskId,
  user,
  wsId,
}: {
  boardId?: string | null;
  listId?: string | null;
  requiredPermission?: TaskBoardGuestPermission;
  sbAdmin: TypedSupabaseClient;
  supabase: TypedSupabaseClient;
  taskId?: string | null;
  user: SupabaseUser;
  wsId: string;
}): Promise<ResolveTaskBoardAccessResult> {
  const context = await loadBoardContext({
    boardId,
    listId,
    sbAdmin,
    taskId,
    wsId,
  });
  if ('error' in context) return context;

  const memberCheck = await verifyWorkspaceMembershipType({
    wsId: context.wsId,
    userId: user.id,
    supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (memberCheck.ok) {
    const permissions = await getPermissions({
      wsId: context.wsId,
      user,
    });
    const canManageProjects =
      permissions?.containsPermission('manage_projects') === true;

    if (canManageProjects || requiredPermission === 'view') {
      return {
        ...context,
        access: {
          mode: 'member',
          permission: canManageProjects ? 'edit' : 'view',
        },
        sbAdmin,
        supabase,
        user,
      };
    }
  }

  const shares = await loadTaskBoardGuestSharesForBoard({
    boardId: context.boardId,
    sbAdmin,
    user,
    workspaceId: context.wsId,
  });

  const share = shares.reduce<TaskBoardGuestShare | null>((best, candidate) => {
    if (!best) return candidate;
    return comparePermission(candidate.permission) >
      comparePermission(best.permission)
      ? candidate
      : best;
  }, null);

  if (
    !share ||
    comparePermission(share.permission) < comparePermission(requiredPermission)
  ) {
    return {
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  return {
    ...context,
    access: { mode: 'guest', permission: share.permission, share },
    sbAdmin,
    supabase,
    user,
  };
}
