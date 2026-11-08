import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireBoardAccessMock = vi.fn();
const sessionSupabase = { from: vi.fn() };
const sessionUser = { id: 'user-1' };

vi.mock('@tuturuuu/auth/cli-session', () => ({
  CLI_APP_TARGET_APP: 'platform',
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    <T>(
      handler: (
        request: NextRequest,
        context: { supabase: typeof sessionSupabase; user: typeof sessionUser },
        params: T
      ) => Promise<Response> | Response
    ) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<T> | T }
    ) => {
      const params = routeContext?.params
        ? await Promise.resolve(routeContext.params)
        : ({} as T);
      return handler(
        request,
        { supabase: sessionSupabase, user: sessionUser },
        params
      );
    },
}));

vi.mock('../lists/access', () => ({
  requireBoardAccess: (...args: Parameters<typeof requireBoardAccessMock>) =>
    requireBoardAccessMock(...args),
}));

import { serializeSprint, type SprintRouteParams } from './_lib';
import {
  addBoardSprint,
  endBoardSprint,
  moveBoardSprintTasks,
  readBoardSprintState,
  removeBoardSprint,
  unplanBoardSprintTasks,
  updateBoardSprint,
  updateBoardSprintLength,
} from './_operations';
import { POST as HTTP_END } from './[sprintId]/end/route';
import { DELETE as HTTP_DELETE, PATCH as HTTP_PATCH } from './[sprintId]/route';
import { POST as HTTP_START } from './[sprintId]/start/route';
import { POST as HTTP_MOVE } from './[sprintId]/tasks/route';
import { POST as HTTP_ADD, PUT as HTTP_PUT } from './route';
import { POST as HTTP_UNPLAN } from './unplanned/route';

type SprintOperation = (
  context: Parameters<typeof readBoardSprintState>[0]
) => Promise<Response>;

function businessUnit(operation: SprintOperation) {
  return async (
    request: NextRequest,
    context: { params: Promise<SprintRouteParams> }
  ) =>
    operation({
      request,
      params: await context.params,
      access: await requireBoardAccessMock(),
    });
}

const GET = businessUnit(readBoardSprintState);
const PUT = businessUnit(updateBoardSprintLength);
const ADD = businessUnit(addBoardSprint);
const PATCH = businessUnit(updateBoardSprint);
const DELETE = businessUnit(removeBoardSprint);
const END = businessUnit(endBoardSprint);
const MOVE = businessUnit(moveBoardSprintTasks);
const UNPLAN = businessUnit(unplanBoardSprintTasks);

const BOARD_ID = '00000000-0000-4000-8000-000000000b01';
const SPRINT_ID = '00000000-0000-4000-8000-000000000c14';
const TASK_A = '00000000-0000-4000-8000-000000000a01';
const TASK_B = '00000000-0000-4000-8000-000000000a02';

type TableResult = { data: unknown; error: unknown };

// Board cycles stay off unless the workspace has ENABLE_BOARD_CYCLES=true.
const CYCLES_ON = {
  workspace_secrets: { data: [{ name: 'ENABLE_BOARD_CYCLES' }], error: null },
};
const CYCLES_GATE = {
  code: 'BOARD_CYCLES_NOT_ENABLED',
  error: 'Board cycles are not enabled for this workspace',
};

/** An RPC result, as supabase-js resolves it. */
function rpcResult(result: TableResult) {
  return Promise.resolve(result);
}

function createAdmin(tables: Record<string, TableResult>) {
  const rpc = vi.fn((..._args: unknown[]) =>
    rpcResult({ data: null, error: null })
  );
  const update = vi.fn();
  const filters: [string, string, unknown][] = [];
  const from = vi.fn((table: string) => {
    const result = tables[table] ?? { data: null, error: null };
    // A resolved promise with chainable query methods, like a PostgREST builder.
    const query = Object.assign(
      Promise.resolve(result),
      {}
    ) as Promise<TableResult> & Record<string, unknown>;
    for (const method of ['select', 'not', 'in']) {
      query[method] = vi.fn(() => query);
    }
    query.eq = vi.fn((column: string, value: unknown) => {
      filters.push([table, column, value]);
      return query;
    });
    query.order = vi.fn(async () => result);
    query.maybeSingle = vi.fn(async () => result);
    query.update = vi.fn((values: unknown) => {
      update(table, values);
      return query;
    });
    return query;
  });
  return { filters, from, rpc, update };
}

function grantAccess(
  sbAdmin: ReturnType<typeof createAdmin>,
  mode: 'member' | 'guest' = 'member'
) {
  requireBoardAccessMock.mockResolvedValue({
    access: { mode, permission: 'edit' },
    boardId: BOARD_ID,
    sbAdmin,
    supabase: sessionSupabase,
    user: sessionUser,
    wsId: 'ws-1',
  });
}

const sprintRows = [
  {
    id: 'sprint-13',
    name: 'Sprint 13',
    sequence_number: 13,
    status: 'completed',
    start_date: '2026-10-05',
    end_date: '2026-10-16',
    goal: 'Calendar reconnect',
    goal_result: 'met',
    started_at: '2026-10-05T08:00:00Z',
    ended_at: '2026-10-16T17:00:00Z',
    task_cycle_tasks: [
      {
        task_id: TASK_A,
        added_after_start: false,
        carry_count: 0,
        end_decision: 'carry',
      },
    ],
  },
  {
    id: SPRINT_ID,
    name: 'Sprint 14',
    sequence_number: 14,
    status: 'active',
    start_date: '2026-10-19',
    end_date: '2026-10-30',
    goal: null,
    goal_result: null,
    started_at: '2026-10-19T08:00:00Z',
    ended_at: null,
    task_cycle_tasks: [
      {
        task_id: TASK_A,
        added_after_start: false,
        carry_count: 1,
        end_decision: null,
      },
    ],
  },
];

const reportRow = {
  cycle_id: 'sprint-13',
  ended_at: '2026-10-16T17:00:00Z',
  ended_by: 'user-1',
  next_cycle_id: SPRINT_ID,
  goal: 'Calendar reconnect',
  goal_result: 'met',
  total_tasks: 14,
  done_tasks: '12',
  added_tasks: 2,
  carried_in_tasks: 1,
  carried_tasks: 1,
  backlog_tasks: 1,
  committed_points: '30',
  done_points: 31,
  added_points: 4,
  people: [
    {
      user_id: 'user-1',
      total_tasks: 5,
      done_tasks: 4,
      total_points: 11,
      done_points: 10,
    },
  ],
};

function request(method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/sprints`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const params = (sprintId?: string) => ({
  params: Promise.resolve({ wsId: 'ws-1', boardId: BOARD_ID, sprintId }),
});

describe('board sprint business routines with prepared board access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists sprints with membership, reports and the board length', async () => {
    const sbAdmin = createAdmin({
      ...CYCLES_ON,
      workspace_boards: { data: { sprint_length_weeks: 2 }, error: null },
      task_cycles: { data: sprintRows, error: null },
      task_sprint_reports: { data: [reportRow], error: null },
    });
    grantAccess(sbAdmin);

    const response = await GET(request('GET'), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.schemaAvailable).toBe(true);
    expect(body.cyclesEnabled).toBe(true);
    expect(body.sprintLengthWeeks).toBe(2);
    expect(body.sprints.map((s: { name: string }) => s.name)).toEqual([
      'Sprint 13',
      'Sprint 14',
    ]);
    expect(body.sprints[0].report).toMatchObject({
      done_tasks: 12,
      committed_points: 30,
      people: [{ user_id: 'user-1', done_tasks: 4 }],
    });
    expect(body.sprints[1].tasks).toEqual([
      {
        task_id: TASK_A,
        added_after_start: false,
        carry_count: 1,
        end_decision: null,
        done: false,
      },
    ]);
    expect(body.sprints[1].report).toBeNull();
    expect(body.unplannedTaskIds).toEqual([]);
  });

  it('lists the open tasks parked outside every sprint', async () => {
    const sbAdmin = createAdmin({
      workspace_boards: { data: { sprint_length_weeks: 2 }, error: null },
      task_cycles: { data: sprintRows, error: null },
      task_sprint_reports: { data: [], error: null },
    });
    sbAdmin.rpc.mockReturnValueOnce(
      rpcResult({ data: [TASK_B], error: null } as TableResult)
    );
    grantAccess(sbAdmin);

    const body = await (await GET(request('GET'), params())).json();

    expect(sbAdmin.rpc).toHaveBeenCalledWith('list_board_unplanned_task_ids', {
      p_board_id: BOARD_ID,
      p_ws_id: 'ws-1',
    });
    expect(body.unplannedTaskIds).toEqual([TASK_B]);
  });

  it('reads every parked task in one snapshot, past the API row cap', async () => {
    const sbAdmin = createAdmin({
      workspace_boards: { data: { sprint_length_weeks: 2 }, error: null },
      task_cycles: { data: sprintRows, error: null },
      task_sprint_reports: { data: [], error: null },
    });
    const ids = Array.from({ length: 1001 }, (_, index) => `task-${index}`);
    sbAdmin.rpc.mockReturnValueOnce(rpcResult({ data: ids, error: null }));
    grantAccess(sbAdmin);

    const body = await (await GET(request('GET'), params())).json();

    expect(
      sbAdmin.rpc.mock.calls.filter(
        ([name]) => name === 'list_board_unplanned_task_ids'
      )
    ).toHaveLength(1);
    expect(body.unplannedTaskIds).toEqual(ids);
  });

  it('marks finished members done and leaves deleted tasks out of a sprint', () => {
    const sprint = serializeSprint({
      ...(sprintRows[1] as Parameters<typeof serializeSprint>[0]),
      task_cycle_tasks: [
        {
          task_id: TASK_A,
          added_after_start: false,
          carry_count: 0,
          end_decision: null,
          task: {
            completed_at: '2026-10-28',
            closed_at: null,
            deleted_at: null,
          },
        },
        {
          task_id: TASK_B,
          added_after_start: true,
          carry_count: 0,
          end_decision: null,
          task: {
            completed_at: null,
            closed_at: null,
            deleted_at: '2026-10-28',
          },
        },
      ],
    });
    expect(sprint.tasks).toEqual([
      expect.objectContaining({ task_id: TASK_A, done: true }),
    ]);
  });

  it('reads as unavailable while the sprint migration is pending', async () => {
    const sbAdmin = createAdmin({
      workspace_boards: {
        data: null,
        error: { code: '42703', message: 'column sprint_length_weeks' },
      },
      task_cycles: { data: [], error: null },
      task_sprint_reports: { data: [], error: null },
    });
    grantAccess(sbAdmin);

    const response = await GET(request('GET'), params());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      cyclesEnabled: false,
      schemaAvailable: false,
      sprintLengthWeeks: null,
      sprints: [],
      unplannedTaskIds: [],
    });
  });

  it('keeps sprint length, start and end with workspace members', async () => {
    const sbAdmin = createAdmin({});
    grantAccess(sbAdmin, 'guest');

    const length = await HTTP_PUT(
      request('PUT', { sprint_length_weeks: 1 }),
      params()
    );
    const start = await HTTP_START(request('POST', {}), params(SPRINT_ID));
    const end = await HTTP_END(request('POST', {}), params(SPRINT_ID));

    expect([length.status, start.status, end.status]).toEqual([403, 403, 403]);
    expect(sbAdmin.rpc).not.toHaveBeenCalled();
  });

  it('turns sprints on with the actor and returns the refreshed sprints', async () => {
    const sbAdmin = createAdmin({
      ...CYCLES_ON,
      workspace_boards: { data: { sprint_length_weeks: 1 }, error: null },
      task_cycles: { data: [], error: null },
      task_sprint_reports: { data: [], error: null },
    });
    grantAccess(sbAdmin);

    const response = await PUT(
      request('PUT', { sprint_length_weeks: 1 }),
      params()
    );

    expect(response.status).toBe(200);
    expect(sbAdmin.rpc).toHaveBeenCalledWith('set_board_sprint_length', {
      p_actor_id: 'user-1',
      p_board_id: BOARD_ID,
      p_weeks: 1,
    });
    expect((await response.json()).sprintLengthWeeks).toBe(1);
    // The flag is read from the board's own workspace.
    expect(sbAdmin.filters).toContainEqual([
      'workspace_secrets',
      'ws_id',
      'ws-1',
    ]);
  });

  it('rejects sprint lengths other than one or two weeks', async () => {
    const sbAdmin = createAdmin({ ...CYCLES_ON });
    grantAccess(sbAdmin);

    const response = await PUT(
      request('PUT', { sprint_length_weeks: 3 }),
      params()
    );

    expect(response.status).toBe(400);
  });

  it('ends a sprint with decisions and maps state errors to 409', async () => {
    const sbAdmin = createAdmin({
      ...CYCLES_ON,
      task_cycles: { data: { id: SPRINT_ID, status: 'active' }, error: null },
    });
    sbAdmin.rpc.mockReturnValueOnce(
      rpcResult({
        data: null,
        error: { code: '55000', message: 'SPRINT_NOT_ACTIVE' },
      } as TableResult)
    );
    grantAccess(sbAdmin);

    const response = await END(
      request('POST', {
        decisions: { [TASK_A]: 'backlog' },
        goal_result: 'partly',
      }),
      params(SPRINT_ID)
    );

    expect(sbAdmin.rpc).toHaveBeenCalledWith('end_board_sprint', {
      p_actor_id: 'user-1',
      p_cycle_id: SPRINT_ID,
      p_decisions: { [TASK_A]: 'backlog' },
      p_goal_result: 'partly',
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'SPRINT_NOT_ACTIVE',
      error: 'SPRINT_NOT_ACTIVE',
    });
  });

  it('moves unique task ids into a sprint for board editors', async () => {
    const sbAdmin = createAdmin({ ...CYCLES_ON });
    sbAdmin.rpc.mockReturnValueOnce(
      rpcResult({ data: 2, error: null } as TableResult)
    );
    grantAccess(sbAdmin, 'guest');

    const response = await MOVE(
      request('POST', { task_ids: [TASK_A, TASK_B, TASK_A] }),
      params(SPRINT_ID)
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ moved: 2 });
    expect(sbAdmin.rpc).toHaveBeenCalledWith('move_tasks_to_board_sprint', {
      p_board_id: BOARD_ID,
      p_cycle_id: SPRINT_ID,
      p_task_ids: [TASK_A, TASK_B],
    });
  });

  it('plans one more sprint and refuses past the open sprint limit', async () => {
    const sbAdmin = createAdmin({
      ...CYCLES_ON,
      workspace_boards: { data: { sprint_length_weeks: 2 }, error: null },
      task_cycles: { data: sprintRows, error: null },
      task_sprint_reports: { data: [], error: null },
    });
    grantAccess(sbAdmin, 'guest');
    sbAdmin.rpc.mockReturnValueOnce(
      rpcResult({
        data: { id: SPRINT_ID },
        error: null,
      } as TableResult)
    );

    const added = await ADD(request('POST', {}), params());
    expect(added.status).toBe(200);
    expect((await added.json()).addedSprintId).toBe(SPRINT_ID);
    expect(sbAdmin.rpc).toHaveBeenCalledWith('add_board_sprint', {
      p_actor_id: 'user-1',
      p_board_id: BOARD_ID,
      p_ws_id: 'ws-1',
    });

    sbAdmin.rpc.mockReturnValueOnce(
      rpcResult({
        data: null,
        error: { code: '55000', message: 'SPRINT_LIMIT_REACHED' },
      } as TableResult)
    );
    const refused = await ADD(request('POST', {}), params());
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({
      code: 'SPRINT_LIMIT_REACHED',
      error: 'SPRINT_LIMIT_REACHED',
    });
  });

  it('removes a planned sprint of this board only', async () => {
    const sbAdmin = createAdmin({
      ...CYCLES_ON,
      task_cycles: { data: { id: SPRINT_ID, status: 'planned' }, error: null },
    });
    sbAdmin.rpc.mockReturnValueOnce(
      rpcResult({
        data: null,
        error: { code: '55000', message: 'SPRINT_NOT_LAST' },
      } as TableResult)
    );
    grantAccess(sbAdmin);

    const response = await DELETE(request('DELETE'), params(SPRINT_ID));

    expect(sbAdmin.rpc).toHaveBeenCalledWith('remove_board_sprint', {
      p_actor_id: 'user-1',
      p_board_id: BOARD_ID,
      p_cycle_id: SPRINT_ID,
      p_ws_id: 'ws-1',
    });
    expect(response.status).toBe(409);

    const elsewhere = createAdmin({
      ...CYCLES_ON,
      task_cycles: { data: null, error: null },
    });
    grantAccess(elsewhere);
    const missing = await DELETE(request('DELETE'), params(SPRINT_ID));
    expect(missing.status).toBe(404);
    expect(elsewhere.rpc).not.toHaveBeenCalled();
  });

  it('takes unique tasks out of every sprint', async () => {
    const sbAdmin = createAdmin({ ...CYCLES_ON });
    sbAdmin.rpc.mockReturnValueOnce(
      rpcResult({ data: 2, error: null } as TableResult)
    );
    grantAccess(sbAdmin, 'guest');

    const response = await UNPLAN(
      request('POST', { task_ids: [TASK_A, TASK_B, TASK_A] }),
      params()
    );

    expect(await response.json()).toEqual({ moved: 2 });
    expect(sbAdmin.rpc).toHaveBeenCalledWith('move_tasks_to_board_sprint', {
      p_board_id: BOARD_ID,
      p_task_ids: [TASK_A, TASK_B],
    });
  });

  it('keeps adding, removing and parking behind the board cycles flag', async () => {
    const sbAdmin = createAdmin({});
    grantAccess(sbAdmin);

    const responses = [
      await HTTP_ADD(request('POST', {}), params()),
      await HTTP_DELETE(request('DELETE'), params(SPRINT_ID)),
      await HTTP_UNPLAN(request('POST', { task_ids: [TASK_A] }), params()),
    ];

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual(CYCLES_GATE);
    }
    expect(sbAdmin.rpc).not.toHaveBeenCalled();
  });

  it('updates the goal of an open sprint only', async () => {
    const sbAdmin = createAdmin({
      ...CYCLES_ON,
      task_cycles: {
        data: { id: SPRINT_ID, status: 'completed' },
        error: null,
      },
    });
    grantAccess(sbAdmin);

    const response = await PATCH(
      request('PATCH', { goal: 'Ship sprints' }),
      params(SPRINT_ID)
    );

    expect(response.status).toBe(409);
    expect(sbAdmin.update).not.toHaveBeenCalled();
  });

  describe('while board cycles are not enabled for the workspace', () => {
    const offTables = () =>
      createAdmin({
        workspace_secrets: { data: [], error: null },
        workspace_boards: { data: { sprint_length_weeks: 2 }, error: null },
        task_cycles: { data: sprintRows, error: null },
        task_sprint_reports: { data: [reportRow], error: null },
      });

    it('refuses every write that turns on, plans, starts or ends cycles', async () => {
      const sbAdmin = offTables();
      grantAccess(sbAdmin);

      const responses = await Promise.all([
        HTTP_PUT(request('PUT', { sprint_length_weeks: 1 }), params()),
        HTTP_PATCH(request('PATCH', { goal: 'Ship' }), params(SPRINT_ID)),
        HTTP_START(request('POST', {}), params(SPRINT_ID)),
        HTTP_END(request('POST', {}), params(SPRINT_ID)),
        HTTP_MOVE(request('POST', { task_ids: [TASK_A] }), params(SPRINT_ID)),
      ]);

      expect(responses.map((response) => response.status)).toEqual([
        403, 403, 403, 403, 403,
      ]);
      for (const response of responses) {
        expect(await response.json()).toEqual(CYCLES_GATE);
      }
      expect(sbAdmin.rpc).not.toHaveBeenCalled();
      expect(sbAdmin.update).not.toHaveBeenCalled();
    });

    it('fails closed when the flag cannot be read', async () => {
      const sbAdmin = createAdmin({
        workspace_secrets: { data: null, error: { message: 'boom' } },
      });
      grantAccess(sbAdmin);

      const response = await HTTP_START(request('POST', {}), params(SPRINT_ID));

      expect(response.status).toBe(403);
      expect(sbAdmin.rpc).not.toHaveBeenCalled();
    });

    it('still lets a board turn cycles off', async () => {
      const sbAdmin = offTables();
      grantAccess(sbAdmin);

      const response = await PUT(
        request('PUT', { sprint_length_weeks: null }),
        params()
      );

      expect(response.status).toBe(200);
      expect(sbAdmin.rpc).toHaveBeenCalledWith('set_board_sprint_length', {
        p_actor_id: 'user-1',
        p_board_id: BOARD_ID,
        p_weeks: null,
      });
    });

    it('keeps reading existing cycles and reports the flag as off', async () => {
      const sbAdmin = offTables();
      grantAccess(sbAdmin);

      const response = await GET(request('GET'), params());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.cyclesEnabled).toBe(false);
      expect(body.sprintLengthWeeks).toBe(2);
      expect(body.sprints).toHaveLength(2);
    });
  });
});
