import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createBoardSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  icon: z.string().nullable().optional(),
  template_id: z.guid().optional(),
});

const listBoardsSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

const BOARD_IDS_BATCH_SIZE = 500;

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { wsId: id } = await params;
    const supabase = await createClient(req);

    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(id, supabase);

    // Read access is membership-gated so board viewers can still enumerate
    // boards for navigation and selection even without manage_projects.
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    const searchParams = listBoardsSearchSchema.parse(
      Object.fromEntries(new URL(req.url).searchParams)
    );

    const page = searchParams.page;
    const pageSize = searchParams.pageSize;

    const boardsQuery = sbAdmin
      .from('workspace_boards')
      .select('*', { count: 'exact' })
      .eq('ws_id', wsId)
      .order('name', { ascending: true })
      .order('created_at', { ascending: false });

    if (page !== undefined && pageSize !== undefined) {
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;
      boardsQuery.range(start, end);
    }

    const { data, error, count } = await boardsQuery;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch workspace boards' },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ boards: [], count: count ?? 0 });
    }

    const boardIds = data.map((board) => board.id);
    const taskLists: Array<{ id: string; board_id: string }> = [];

    for (let i = 0; i < boardIds.length; i += BOARD_IDS_BATCH_SIZE) {
      const boardIdBatch = boardIds.slice(i, i + BOARD_IDS_BATCH_SIZE);
      const { data: batchTaskLists, error: listsError } = await sbAdmin
        .from('task_lists')
        .select('id, board_id')
        .in('board_id', boardIdBatch)
        .eq('deleted', false);

      if (listsError) {
        return NextResponse.json(
          { error: 'Failed to fetch task board list counts' },
          { status: 500 }
        );
      }

      taskLists.push(...(batchTaskLists ?? []));
    }

    const listIds = taskLists.map((list) => list.id);
    const taskCountsByList: { [key: string]: number } = {};
    if (listIds.length > 0) {
      const tasks: Array<{ list_id: string | null }> = [];
      let tasksError: { message: string } | null = null;

      for (let i = 0; i < listIds.length; i += BOARD_IDS_BATCH_SIZE) {
        const listIdBatch = listIds.slice(i, i + BOARD_IDS_BATCH_SIZE);
        const { data: batchTasks, error: batchTasksError } = await sbAdmin
          .from('tasks')
          .select('list_id')
          .in('list_id', listIdBatch)
          .is('deleted_at', null);

        if (batchTasksError) {
          tasksError = batchTasksError;
          break;
        }

        tasks.push(...(batchTasks ?? []));
      }

      if (tasksError) {
        return NextResponse.json(
          { error: 'Failed to fetch task board task counts' },
          { status: 500 }
        );
      }

      for (const task of tasks) {
        if (!task.list_id) continue;
        taskCountsByList[task.list_id] =
          (taskCountsByList[task.list_id] ?? 0) + 1;
      }
    }

    const listCountsByBoard: { [key: string]: number } = {};
    const taskCountsByBoard: { [key: string]: number } = {};
    for (const list of taskLists) {
      listCountsByBoard[list.board_id] =
        (listCountsByBoard[list.board_id] ?? 0) + 1;
      taskCountsByBoard[list.board_id] =
        (taskCountsByBoard[list.board_id] ?? 0) +
        (taskCountsByList[list.id] ?? 0);
    }

    const boards = data.map((board) => ({
      ...board,
      list_count: listCountsByBoard[board.id] ?? 0,
      task_count: taskCountsByBoard[board.id] ?? 0,
    }));

    return NextResponse.json({ boards, count: count ?? boards.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request parameters' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { wsId: id } = await params;
    const supabase = await createClient(req);
    const wsId = await normalizeWorkspaceId(id, supabase);

    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissions = await getPermissions({ wsId, request: req });
    if (!permissions?.containsPermission('manage_projects')) {
      return NextResponse.json(
        { error: "You don't have permission to perform this operation" },
        { status: 403 }
      );
    }

    // Verify membership
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const parsedBody = createBoardSchema.parse(await req.json());

    const insertPayload: Database['public']['Tables']['workspace_boards']['Insert'] =
      {
        ws_id: wsId,
        name: parsedBody.name || 'Untitled Board',
        icon:
          (parsedBody.icon as
            | Database['public']['Enums']['platform_icon']
            | null
            | undefined) ?? null,
        template_id: parsedBody.template_id,
        creator_id: user.id,
      };

    const sbAdmin = await createAdminClient();

    const { data, error } = await sbAdmin
      .from('workspace_boards')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create workspace board' },
        { status: 500 }
      );
    }

    return NextResponse.json({ board: data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid request payload' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
