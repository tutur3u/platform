import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

export type BoardRouteAuthContext = {
  appSession?: boolean;
  sbAdmin?: TypedSupabaseClient;
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
};

type BoardRouteAuth =
  | {
      auth: BoardRouteAuthContext;
    }
  | {
      response: NextResponse;
    };

const paramsSchema = z.object({
  boardId: z.guid(),
});

const TASK_BOARD_NAME_EXISTS_CODE = 'TASK_BOARD_NAME_EXISTS';
const TASK_BOARD_NAME_EXISTS_ERROR =
  'A task board with this name already exists';
const DEFAULT_LIST_COLUMN_UNAVAILABLE_ERROR =
  'Default task list settings are not available until the database migration is applied';
const DEFAULT_LIST_COLUMNS = [
  'default_list_id',
  'default_done_list_id',
  'default_closed_list_id',
] as const;

type DefaultListColumn = (typeof DEFAULT_LIST_COLUMNS)[number];
type BoardUpdatePayload =
  Database['public']['Tables']['workspace_boards']['Update'] & {
    default_done_list_id?: string | null;
    default_closed_list_id?: string | null;
  };

function isUniqueViolation(error: unknown) {
  return error instanceof Object && 'code' in error && error.code === '23505';
}

function isDefaultListColumnUnavailable(error: unknown) {
  if (!(error instanceof Object)) {
    return false;
  }

  const code = 'code' in error ? error.code : undefined;
  const message = 'message' in error ? error.message : undefined;

  return (
    code === '42703' ||
    (typeof message === 'string' &&
      DEFAULT_LIST_COLUMNS.some((column) => message.includes(column)))
  );
}

function getDefaultListValidationMessage(column: DefaultListColumn) {
  if (column === 'default_done_list_id') {
    return 'Default done list must belong to this board and use the done status';
  }

  if (column === 'default_closed_list_id') {
    return 'Default closed list must belong to this board and use the closed status';
  }

  return 'Default list does not belong to this board';
}

function getDefaultListValidationStatus(column: DefaultListColumn) {
  if (column === 'default_done_list_id') return 'done';
  if (column === 'default_closed_list_id') return 'closed';
  return null;
}

async function validateDefaultListColumn({
  boardId,
  column,
  listId,
  sbAdmin,
}: {
  boardId: string;
  column: DefaultListColumn;
  listId: string;
  sbAdmin: TypedSupabaseClient;
}) {
  const expectedStatus = getDefaultListValidationStatus(column);
  let query = sbAdmin
    .from('task_lists')
    .select('id')
    .eq('id', listId)
    .eq('board_id', boardId)
    .eq('deleted', false);

  if (expectedStatus) {
    query = query.eq('status', expectedStatus);
  }

  const { data: list, error: listError } = await query.maybeSingle();

  if (listError) {
    return NextResponse.json(
      { message: 'Failed to validate default list' },
      { status: 500 }
    );
  }

  if (!list) {
    return NextResponse.json(
      { message: getDefaultListValidationMessage(column) },
      { status: 400 }
    );
  }

  return null;
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

async function resolveBoardRouteAuth(
  req: Request,
  auth?: BoardRouteAuthContext
): Promise<BoardRouteAuth> {
  if (auth) {
    return { auth };
  }

  const supabase = (await createClient(req)) as TypedSupabaseClient;
  const { user, authError: userError } =
    await resolveAuthenticatedSessionUser(supabase);

  if (userError || !user) {
    return {
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { auth: { supabase, user } };
}

export async function handleBoardRoutePUT(
  req: Request,
  { params }: Params,
  authContext?: BoardRouteAuthContext
) {
  const { wsId: id, boardId } = await params;
  const parsedSchema = paramsSchema.safeParse({ boardId });
  if (!parsedSchema.success) {
    return NextResponse.json({ message: 'Invalid board ID' }, { status: 400 });
  }
  const authResult = await resolveBoardRouteAuth(req, authContext);
  if ('response' in authResult) return authResult.response;

  const { auth } = authResult;
  const { supabase, user } = auth;
  const wsId = await normalizeWorkspaceId(id, supabase);

  const { boardId: parsedBoardId } = parsedSchema.data;

  const member = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase,
  });

  if (member.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!member.ok) {
    return NextResponse.json(
      { message: "You don't have access to this workspace" },
      { status: 403 }
    );
  }

  const data = (await req.json()) as {
    name?: string;
    icon?: Database['public']['Enums']['platform_icon'] | null;
    ticket_prefix?: string | null;
    default_list_id?: string | null;
    default_done_list_id?: string | null;
    default_closed_list_id?: string | null;
    archived?: boolean;
    deleted?: boolean;
    restore?: boolean;
    group_ids?: string[];
  };
  const hasDefaultListUpdate = DEFAULT_LIST_COLUMNS.some((column) =>
    Object.hasOwn(data, column)
  );

  const { group_ids: _, archived, deleted, restore, ...coreData } = data;

  const updateData: BoardUpdatePayload = { ...coreData };

  const now = new Date().toISOString();
  if (archived !== undefined) {
    updateData.archived_at = archived ? now : null;
  }

  if (restore === true) {
    updateData.deleted_at = null;
  } else if (deleted === true) {
    updateData.deleted_at = now;
  }

  const sbAdmin =
    auth.sbAdmin ?? ((await createAdminClient()) as TypedSupabaseClient);

  // Default list columns intentionally have no database foreign keys, so the
  // API validates board ownership/status before persisting them. Null clears.
  for (const column of DEFAULT_LIST_COLUMNS) {
    const listId = data[column];
    if (typeof listId !== 'string') continue;

    const validationResponse = await validateDefaultListColumn({
      boardId: parsedBoardId,
      column,
      listId,
      sbAdmin,
    });

    if (validationResponse) return validationResponse;
  }

  let { error } = await sbAdmin
    .from('workspace_boards')
    .update(updateData)
    .eq('id', parsedBoardId)
    .eq('ws_id', wsId);

  // Rollout safety: if `default_list_id` has not been migrated yet in this
  // environment, retry without it only when other board edits still need to
  // save. A default-list-only update must fail visibly instead of reporting a
  // false success.
  if (error && hasDefaultListUpdate && isDefaultListColumnUnavailable(error)) {
    const rest = { ...updateData };
    for (const column of DEFAULT_LIST_COLUMNS) {
      delete rest[column];
    }

    if (Object.keys(rest).length === 0) {
      return NextResponse.json(
        { message: DEFAULT_LIST_COLUMN_UNAVAILABLE_ERROR },
        { status: 503 }
      );
    }

    ({ error } = await sbAdmin
      .from('workspace_boards')
      .update(rest)
      .eq('id', parsedBoardId)
      .eq('ws_id', wsId));
  }

  if (error) {
    if (isUniqueViolation(error)) {
      return taskBoardNameExistsResponse();
    }

    return NextResponse.json(
      { message: 'Error updating workspace board' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function PUT(req: Request, context: Params) {
  return handleBoardRoutePUT(req, context);
}

export async function handleBoardRouteDELETE(
  req: Request,
  { params }: Params,
  authContext?: BoardRouteAuthContext
) {
  const { wsId: id, boardId } = await params;
  const parsedSchema = paramsSchema.safeParse({ boardId });
  if (!parsedSchema.success) {
    return NextResponse.json({ message: 'Invalid board ID' }, { status: 400 });
  }
  const authResult = await resolveBoardRouteAuth(req, authContext);
  if ('response' in authResult) return authResult.response;

  const { auth } = authResult;
  const { supabase, user } = auth;
  const wsId = await normalizeWorkspaceId(id, supabase);

  const { boardId: parsedBoardId } = parsedSchema.data;

  const member = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase,
  });

  if (member.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!member.ok) {
    return NextResponse.json(
      { message: "You don't have access to this workspace" },
      { status: 403 }
    );
  }

  const sbAdmin =
    auth.sbAdmin ?? ((await createAdminClient()) as TypedSupabaseClient);

  const { error } = await sbAdmin
    .from('workspace_boards')
    .delete()
    .eq('id', parsedBoardId)
    .eq('ws_id', wsId);

  if (error) {
    return NextResponse.json(
      { message: 'Error deleting workspace board' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, context: Params) {
  return handleBoardRouteDELETE(req, context);
}
