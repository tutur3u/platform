import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { Constants, type Database } from '@tuturuuu/types/supabase';
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
const TASK_BOARD_TICKET_PREFIX_TAKEN_CODE = 'TASK_BOARD_TICKET_PREFIX_TAKEN';
const TASK_BOARD_TICKET_PREFIX_TAKEN_ERROR =
  'This board key is reserved in this workspace';
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

function isTicketPrefixTaken(error: unknown) {
  return (
    isUniqueViolation(error) &&
    error instanceof Object &&
    'message' in error &&
    typeof error.message === 'string' &&
    (error.message.includes('TASK_BOARD_TICKET_PREFIX_PROJECT_KEY') ||
      error.message.includes('TASK_BOARD_TICKET_PREFIX_RESERVED') ||
      error.message.includes('workspace_boards_workspace_ticket_prefix_unique'))
  );
}

const boardTicketPrefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => !value || /^[A-Z][A-Z0-9_-]{0,11}$/.test(value))
  .transform((value) => value || null)
  .nullish();

const boardUpdateSchema = z.strictObject({
  name: z.string().nullish(),
  icon: z.enum(Constants.public.Enums.platform_icon).nullish(),
  ticket_prefix: z.unknown().optional(),
  default_list_id: z.string().nullish(),
  default_done_list_id: z.string().nullish(),
  default_closed_list_id: z.string().nullish(),
  archived: z.boolean().optional(),
  deleted: z.boolean().optional(),
  restore: z.boolean().optional(),
  group_ids: z.array(z.string()).optional(),
});

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

  const body: unknown = await req.json().catch(() => null);
  const parsedUpdate = boardUpdateSchema.safeParse(body);
  if (!parsedUpdate.success) {
    return NextResponse.json(
      { message: 'Invalid board update' },
      { status: 400 }
    );
  }
  const data = parsedUpdate.data;
  const hasDefaultListUpdate = DEFAULT_LIST_COLUMNS.some((column) =>
    Object.hasOwn(data, column)
  );

  const {
    group_ids: _,
    archived,
    deleted,
    restore,
    ticket_prefix: ticketPrefix,
    ...coreData
  } = data;
  const updateData: BoardUpdatePayload = coreData;

  if (Object.hasOwn(data, 'ticket_prefix')) {
    const prefix = boardTicketPrefixSchema.safeParse(ticketPrefix);
    if (!prefix.success) {
      return NextResponse.json(
        {
          code: 'TASK_BOARD_TICKET_PREFIX_INVALID',
          error: 'Invalid board key',
        },
        { status: 400 }
      );
    }
    updateData.ticket_prefix = prefix.data ?? null;
  }

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

  if (Object.hasOwn(updateData, 'ticket_prefix')) {
    const { error } = await sbAdmin
      .schema('private')
      .from('task_board_ticket_keys')
      .select('board_id', { head: true })
      .eq('ws_id', wsId)
      .limit(1);

    if (error) {
      return NextResponse.json(
        {
          code: 'TASK_BOARD_TICKET_PREFIX_UNAVAILABLE',
          error:
            'Board keys cannot be edited until the database migration is available',
        },
        { status: 503 }
      );
    }
  }

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
    if (isTicketPrefixTaken(error)) {
      return NextResponse.json(
        {
          code: TASK_BOARD_TICKET_PREFIX_TAKEN_CODE,
          error: TASK_BOARD_TICKET_PREFIX_TAKEN_ERROR,
        },
        { status: 409 }
      );
    }
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
