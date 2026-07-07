import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_COLOR_LENGTH, MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';

const TASK_HISTORY_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'tasks'],
} as const;

const querySchema = z.object({
  page: z
    .string()
    .nullish()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  pageSize: z
    .string()
    .nullish()
    .transform((val) => (val ? parseInt(val, 10) : 20)),
  change_type: z
    .enum([
      'task_created',
      'field_updated',
      'assignee_added',
      'assignee_removed',
      'label_added',
      'label_removed',
      'project_linked',
      'project_unlinked',
    ])
    .nullish(),
  field_name: z
    .enum([
      'name',
      'description',
      'priority',
      'end_date',
      'start_date',
      'estimation_points',
      'list_id',
      'completed',
      'deleted_at',
    ])
    .nullish(),
  board_id: z.guid().nullish(),
  from: z.string().max(MAX_COLOR_LENGTH).nullish(),
  to: z.string().max(MAX_COLOR_LENGTH).nullish(),
  search: z.string().max(MAX_SEARCH_LENGTH).nullish(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getListIdFromHistoryValue(value: unknown) {
  if (typeof value === 'string' && z.guid().safeParse(value).success) {
    return value;
  }

  if (!isRecord(value)) return null;

  const id = value.id;
  return typeof id === 'string' && z.guid().safeParse(id).success ? id : null;
}

function getListNameFromMetadata(metadata: unknown, key: string) {
  if (!isRecord(metadata)) return null;

  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function formatListHistoryValue({
  fallbackName,
  listNamesById,
  value,
}: {
  fallbackName: string | null;
  listNamesById: Map<string, string>;
  value: unknown;
}) {
  const id = getListIdFromHistoryValue(value);
  if (!id) return fallbackName ?? value;

  return {
    id,
    name: fallbackName ?? listNamesById.get(id) ?? null,
  };
}

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type AdminHistoryRow = {
  id: string;
  task_id: string | null;
  changed_by: string | null;
  changed_at: string;
  change_type: string | null;
  field_name: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: unknown;
  tasks?: {
    id: string;
    name: string | null;
    deleted_at: string | null;
    task_lists?: {
      id: string;
      name: string | null;
      workspace_boards?: {
        id: string;
        name: string | null;
        ws_id: string;
      } | null;
    } | null;
  } | null;
  users?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

async function fetchHistoryViaAdminQuery({
  board_id,
  change_type,
  field_name,
  from,
  page,
  pageSize,
  search,
  to,
  wsId,
}: {
  board_id: string | null | undefined;
  change_type: string | null | undefined;
  field_name: string | null | undefined;
  from: string | null | undefined;
  page: number;
  pageSize: number;
  search: string | null | undefined;
  to: string | null | undefined;
  wsId: string;
}) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const offset = Math.max(0, (page - 1) * pageSize);
  let query = (sbAdmin as any)
    .from('task_history')
    .select(
      `
        id,
        task_id,
        changed_by,
        changed_at,
        change_type,
        field_name,
        old_value,
        new_value,
        metadata,
        tasks!inner(
          id,
          name,
          deleted_at,
          task_lists!inner(
            id,
            name,
            workspace_boards!inner(
              id,
              name,
              ws_id
            )
          )
        ),
        users!task_history_changed_by_fkey(
          id,
          display_name,
          avatar_url
        )
      `,
      { count: 'exact' }
    )
    .is('deleted_at', null)
    .eq('tasks.task_lists.workspace_boards.ws_id', wsId);

  if (board_id) {
    query = query.eq('tasks.task_lists.workspace_boards.id', board_id);
  }

  if (change_type) {
    query = query.eq('change_type', change_type);
  }

  if (field_name) {
    query = query.eq('field_name', field_name);
  }

  if (from) {
    query = query.gte('changed_at', from);
  }

  if (to) {
    query = query.lte('changed_at', to);
  }

  if (search) {
    query = query.ilike('tasks.name', `%${search}%`);
  }

  const { count, data, error } = await query
    .order('changed_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    throw error;
  }

  return {
    history: ((data ?? []) as AdminHistoryRow[]).map((entry) => {
      const task = firstRelated(entry.tasks);
      const list = firstRelated(task?.task_lists);
      const board = firstRelated(list?.workspace_boards);
      const user = firstRelated(entry.users);

      return {
        board_id: board?.id ?? null,
        board_name: board?.name ?? null,
        change_type: entry.change_type,
        changed_at: entry.changed_at,
        changed_by: entry.changed_by,
        field_name: entry.field_name,
        id: entry.id,
        metadata: entry.metadata,
        new_value: entry.new_value,
        old_value: entry.old_value,
        task_deleted_at: task?.deleted_at ?? null,
        task_id: entry.task_id,
        task_name: task?.name ?? 'Unknown Task',
        task_permanently_deleted: false,
        total_count: count ?? 0,
        user_avatar_url: user?.avatar_url ?? null,
        user_display_name: user?.display_name ?? null,
        user_id: user?.id ?? entry.changed_by,
      };
    }),
    totalCount: count ?? 0,
  };
}

/**
 * GET /api/v1/workspaces/[wsId]/tasks/history
 * Fetches workspace-wide task change history with pagination and filtering
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const auth = await resolveSessionAuthContext(req, {
      allowAppSessionAuth: TASK_HISTORY_APP_SESSION_AUTH,
    });
    if (!auth.ok) return auth.response;

    const { wsId: rawWsId } = await params;
    const wsId = await normalizeWorkspaceId(rawWsId, auth.supabase);
    const membership = await verifyWorkspaceMembershipType({
      supabase: auth.supabase,
      userId: auth.user.id,
      wsId,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json(
        { error: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const queryParams = querySchema.safeParse({
      page: searchParams.get('page'),
      pageSize: searchParams.get('pageSize'),
      change_type: searchParams.get('change_type'),
      field_name: searchParams.get('field_name'),
      board_id: searchParams.get('board_id'),
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      search: searchParams.get('search'),
    });

    if (!queryParams.success) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: queryParams.error.issues,
        },
        { status: 400 }
      );
    }

    const {
      page,
      pageSize,
      change_type,
      field_name,
      board_id,
      from,
      to,
      search,
    } = queryParams.data;

    // Call the RPC function for efficient data retrieval
    const { data: rpcHistory, error: historyError } = await auth.supabase.rpc(
      'get_workspace_task_history',
      {
        p_ws_id: wsId,
        p_page: page,
        p_page_size: pageSize,
        p_change_type: change_type ?? undefined,
        p_field_name: field_name ?? undefined,
        p_board_id: board_id ?? undefined,
        p_search: search ?? undefined,
        p_from: from ?? undefined,
        p_to: to ?? undefined,
      }
    );

    let history = rpcHistory;
    let totalCount = rpcHistory?.[0]?.total_count ?? 0;

    if (historyError) {
      console.error('Error fetching task history:', historyError);

      if (historyError.message === 'Access denied to workspace') {
        const fallback = await fetchHistoryViaAdminQuery({
          board_id,
          change_type,
          field_name,
          from,
          page,
          pageSize,
          search,
          to,
          wsId,
        });
        history = fallback.history as NonNullable<typeof rpcHistory>;
        totalCount = fallback.totalCount;
      } else {
        return NextResponse.json(
          { error: 'Failed to fetch task history' },
          { status: 500 }
        );
      }
    }

    const listIds = new Set<string>();

    for (const entry of history ?? []) {
      if (entry.field_name !== 'list_id') continue;

      const oldListId = getListIdFromHistoryValue(entry.old_value);
      const newListId = getListIdFromHistoryValue(entry.new_value);

      if (oldListId) listIds.add(oldListId);
      if (newListId) listIds.add(newListId);
    }

    const listNamesById = new Map<string, string>();

    if (listIds.size > 0) {
      const { data: lists } = await auth.supabase
        .from('task_lists')
        .select('id, name')
        .in('id', [...listIds]);

      for (const list of lists ?? []) {
        if (list.name) listNamesById.set(list.id, list.name);
      }
    }

    // Format the response
    const formattedHistory = (history || []).map((entry) => ({
      id: entry.id,
      task_id: entry.task_id,
      task_name: entry.task_name || 'Unknown Task',
      task_deleted_at: entry.task_deleted_at ?? undefined,
      task_permanently_deleted: entry.task_permanently_deleted ?? false,
      board_id: entry.board_id ?? undefined,
      board_name: entry.board_name ?? undefined,
      changed_by: entry.changed_by ?? undefined,
      changed_at: entry.changed_at,
      change_type: entry.change_type ?? undefined,
      field_name: entry.field_name ?? undefined,
      old_value:
        entry.field_name === 'list_id'
          ? formatListHistoryValue({
              fallbackName: getListNameFromMetadata(
                entry.metadata,
                'old_list_name'
              ),
              listNamesById,
              value: entry.old_value,
            })
          : (entry.old_value ?? undefined),
      new_value:
        entry.field_name === 'list_id'
          ? formatListHistoryValue({
              fallbackName: getListNameFromMetadata(
                entry.metadata,
                'new_list_name'
              ),
              listNamesById,
              value: entry.new_value,
            })
          : (entry.new_value ?? undefined),
      metadata: entry.metadata,
      user: entry.user_id
        ? {
            id: entry.user_id,
            name: entry.user_display_name || 'Unknown',
            avatar_url: entry.user_avatar_url,
          }
        : null,
    }));

    return NextResponse.json({
      data: formattedHistory,
      count: Number(totalCount),
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Error in workspace task history API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
