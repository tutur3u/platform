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

function isUniqueViolation(error: unknown) {
  return (
    error !== null &&
    error !== undefined &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '23505'
  );
}

function isDefaultListColumnUnavailable(error: unknown) {
  if (error === null || error === undefined || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? error.code : undefined;
  const message = 'message' in error ? error.message : undefined;

  return (
    code === '42703' ||
    (typeof message === 'string' && message.includes('default_list_id'))
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
    archived?: boolean;
    deleted?: boolean;
    restore?: boolean;
    group_ids?: string[];
  };
  const hasDefaultListUpdate = Object.hasOwn(data, 'default_list_id');

  const { group_ids: _, archived, deleted, restore, ...coreData } = data;

  const updateData: Database['public']['Tables']['workspace_boards']['Update'] =
    { ...coreData };

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

  // When setting a default list for new tasks, ensure it belongs to this board
  // and is not deleted. A null value clears the default (revert to first list).
  if (typeof data.default_list_id === 'string') {
    const { data: list, error: listError } = await sbAdmin
      .from('task_lists')
      .select('id')
      .eq('id', data.default_list_id)
      .eq('board_id', parsedBoardId)
      .eq('deleted', false)
      .maybeSingle();

    if (listError) {
      return NextResponse.json(
        { message: 'Failed to validate default list' },
        { status: 500 }
      );
    }

    if (!list) {
      return NextResponse.json(
        { message: 'Default list does not belong to this board' },
        { status: 400 }
      );
    }
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
    const { default_list_id: _droppedDefaultListId, ...rest } = updateData;
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
