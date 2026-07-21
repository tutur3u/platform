import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  loadTaskBoardGuestSharesForWorkspace,
  summarizeTaskBoardGuestShares,
} from '@tuturuuu/tasks-api/server/board-access';
import type { Database } from '@tuturuuu/types';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { type SessionAuthContext, withSessionAuth } from '@/lib/api-auth';
import { ensureDefaultPersonalTaskBoard } from '@/lib/tasks/default-personal-task-board';

const createBoardSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  icon: z.string().nullable().optional(),
  template_id: z.guid().optional(),
});

const TASK_BOARD_NAME_EXISTS_CODE = 'TASK_BOARD_NAME_EXISTS';
const TASK_BOARD_NAME_EXISTS_ERROR =
  'A task board with this name already exists';

const listBoardsSearchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  status: z
    .enum(['active', 'archived', 'deleted', 'all'])
    .optional()
    .default('active'),
});

const BOARD_IDS_BATCH_SIZE = 500;

const TASK_BOARD_ROUTE_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'calendar', 'tasks'],
} as const;

function isUniqueViolation(error: unknown) {
  return error instanceof Object && 'code' in error && error.code === '23505';
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

type TaskBoardRouteParams = {
  wsId: string;
};

async function createTaskBoardAdminClient() {
  return (await createAdminClient({ noCookie: true })) as TypedSupabaseClient;
}

export const GET = withSessionAuth<TaskBoardRouteParams>(
  async (req: NextRequest, auth: SessionAuthContext, { wsId: id }) => {
    try {
      const wsId = await normalizeWorkspaceId(id, auth.supabase);

      const memberCheck = await verifyWorkspaceMembershipType({
        wsId: wsId,
        userId: auth.user.id,
        supabase: auth.supabase,
      });

      if (memberCheck.error === 'membership_lookup_failed') {
        return NextResponse.json(
          { error: 'Failed to verify workspace access' },
          { status: 500 }
        );
      }

      if (memberCheck.ok) {
        const permissions = await getPermissions({ wsId, user: auth.user });
        if (!permissions?.containsPermission('manage_projects')) {
          return NextResponse.json(
            { error: "You don't have permission to view task boards" },
            { status: 403 }
          );
        }
      }

      const sbAdmin = await createTaskBoardAdminClient();

      if (memberCheck.ok) {
        await ensureDefaultPersonalTaskBoard({
          sbAdmin,
          userId: auth.user.id,
          wsId,
        });
      }

      const guestShares = memberCheck.ok
        ? []
        : await loadTaskBoardGuestSharesForWorkspace({
            sbAdmin,
            user: auth.user,
            workspaceId: wsId,
          });
      const guestSummary = summarizeTaskBoardGuestShares(guestShares);

      if (!memberCheck.ok && guestSummary.boardCount === 0) {
        return NextResponse.json(
          { error: 'Workspace access denied' },
          { status: 403 }
        );
      }

      const searchParams = listBoardsSearchSchema.parse(
        Object.fromEntries(new URL(req.url).searchParams)
      );

      const page = searchParams.page;
      const pageSize = searchParams.pageSize;
      const status = searchParams.status;

      const boardsQuery = sbAdmin
        .from('workspace_boards')
        .select('*', { count: 'exact' })
        .eq('ws_id', wsId)
        .order('name', { ascending: true })
        .order('created_at', { ascending: false });

      if (searchParams.q) {
        boardsQuery.ilike('name', `%${searchParams.q}%`);
      }

      if (status === 'active') {
        boardsQuery.is('archived_at', null).is('deleted_at', null);
      } else if (status === 'archived') {
        boardsQuery.not('archived_at', 'is', null).is('deleted_at', null);
      } else if (status === 'deleted') {
        boardsQuery.not('deleted_at', 'is', null);
      }

      if (!memberCheck.ok) {
        boardsQuery.in('id', guestSummary.boardIds);
      }

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

      const guestPermissionByBoardId = new Map(
        guestShares.map((share) => [share.board_id, share.permission] as const)
      );
      const boards = data.map((board) => ({
        ...board,
        list_count: listCountsByBoard[board.id] ?? 0,
        task_count: taskCountsByBoard[board.id] ?? 0,
        access_type: memberCheck.ok ? 'member' : 'guest',
        guest_permission: memberCheck.ok
          ? null
          : (guestPermissionByBoardId.get(board.id) ?? 'view'),
      }));

      return NextResponse.json({
        boards,
        count: count ?? boards.length,
        access_type: memberCheck.ok ? 'member' : 'guest',
        guest_highest_permission: memberCheck.ok
          ? null
          : guestSummary.highestPermission,
      });
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
  },
  { allowAppSessionAuth: TASK_BOARD_ROUTE_APP_SESSION_AUTH }
);

export const POST = withSessionAuth<TaskBoardRouteParams>(
  async (req: NextRequest, auth: SessionAuthContext, { wsId: id }) => {
    try {
      const wsId = await normalizeWorkspaceId(id, auth.supabase);

      const permissions = await getPermissions({ wsId, user: auth.user });
      if (!permissions?.containsPermission('manage_projects')) {
        return NextResponse.json(
          { error: "You don't have permission to perform this operation" },
          { status: 403 }
        );
      }

      // Verify membership
      const memberCheck = await verifyWorkspaceMembershipType({
        wsId,
        userId: auth.user.id,
        supabase: auth.supabase,
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
          creator_id: auth.user.id,
        };

      const sbAdmin = await createTaskBoardAdminClient();

      const { data, error } = await sbAdmin
        .from('workspace_boards')
        .insert(insertPayload)
        .select('*')
        .single();

      if (error) {
        if (isUniqueViolation(error)) {
          return taskBoardNameExistsResponse();
        }

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
  },
  { allowAppSessionAuth: TASK_BOARD_ROUTE_APP_SESSION_AUTH }
);
