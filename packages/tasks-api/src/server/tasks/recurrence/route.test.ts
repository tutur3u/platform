import { beforeEach, describe, expect, it, vi } from 'vitest';
import { issueRecurrenceReceipt, verifyRecurrenceReceipt } from './receipt';
import { handleTaskRecurrence } from './route';

const mock = vi.hoisted(() => ({
  membership: vi.fn(),
  boardAccess: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: mock.membership }) }),
      }),
    }),
    schema: () => ({ rpc: mock.rpc }),
  })),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (id: string) => id,
}));
vi.mock('@tuturuuu/utils/yjs-task-description', () => ({
  deriveTaskDescriptionYjsState: () => null,
}));
vi.mock('../../board-access', () => ({
  resolveTaskBoardAccess: mock.boardAccess,
}));

const workspace = '00000000-0000-4000-8000-000000001001';
const actor = '00000000-0000-4000-8000-000000001002';
const other = '00000000-0000-4000-8000-000000001003';
const list = '00000000-0000-4000-8000-000000001004';
const task = '00000000-0000-4000-8000-000000001005';
const board = '00000000-0000-4000-8000-000000001006';
const key = 'test-only-recurrence-signing-key-32-bytes';
const session = { user: { id: actor }, supabase: {} } as Parameters<
  typeof handleTaskRecurrence
>[2];

const prepareData = { board_id: board, global_epoch: 2, workspace_epoch: 1 };
const spec = {
  schedule: {
    rule: {
      version: 1,
      frequency: 'daily',
      interval: 1,
      end: { type: 'never' },
      timeZone: 'UTC',
    },
    anchorDate: '2026-11-24',
    dueTime: null,
    startOffsetDays: 0,
  },
  template: {
    title: 'Review',
    description: null,
    priority: null,
    estimate: null,
    labels: [],
    projects: [],
    assignees: [],
  },
};

function request(body: Record<string, unknown>) {
  return handleTaskRecurrence(
    new Request('https://example.test/api', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    workspace,
    session,
    key
  );
}

function completion() {
  return {
    operation: 'complete',
    taskId: task,
    listId: list,
    receipt: issueRecurrenceReceipt(key, workspace, actor),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mock.membership.mockResolvedValue({ data: { type: 'MEMBER' }, error: null });
  mock.boardAccess.mockResolvedValue({
    access: { mode: 'member', permission: 'edit' },
  });
});

describe('task recurrence request boundary', () => {
  it('never calls capture or generation for a guest or guest-mode edit', async () => {
    mock.membership.mockResolvedValueOnce({
      data: { type: 'GUEST' },
      error: null,
    });
    expect((await request(completion())).status).toBe(404);
    mock.boardAccess.mockResolvedValueOnce({
      access: { mode: 'guest', permission: 'edit' },
    });
    expect((await request(completion())).status).toBe(404);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('rejects a forged actor field and a receipt signed for a different actor', async () => {
    expect((await request({ ...completion(), actor: other })).status).toBe(400);
    const forged = issueRecurrenceReceipt(key, workspace, other);
    expect((await request({ ...completion(), receipt: forged })).status).toBe(
      409
    );
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('keeps the proof private and submits one bounded generation call', async () => {
    mock.rpc
      .mockResolvedValueOnce({
        data: { status: 'completed', pending: true },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          transition_id: other,
          rule: spec.schedule.rule,
          anchor_date: '2026-11-24',
          due_time: null,
          start_offset_days: 0,
          cursor_date: '2026-11-25',
          consumed_count: 0,
          description: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { status: 'completed', task_ids: [task] },
        error: null,
      });
    const response = await request(completion());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'completed',
      task_ids: [task],
    });
    expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual([
      'task_recurrence_begin_completion',
      'task_recurrence_prepare_completion',
      'task_recurrence_complete',
    ]);
    const args = mock.rpc.mock.calls[2]?.[1];
    expect(args).toMatchObject({
      p_actor: actor,
      p_ws: workspace,
      p_items: [
        {
          task_id: task,
          transition_id: other,
          list_id: list,
          plan: { date: '2026-11-25' },
        },
      ],
    });
  });

  it('passes verified receipt identity on replay and surfaces changed-input conflicts', async () => {
    const token = issueRecurrenceReceipt(key, workspace, actor);
    const receipt = verifyRecurrenceReceipt(key, workspace, actor, token);
    mock.rpc.mockImplementation(
      async (
        name: string,
        args: { p_spec?: { template: { title: string } } }
      ) => {
        if (name === 'task_recurrence_prepare_create')
          return { data: prepareData, error: null };
        return args.p_spec?.template.title === spec.template.title
          ? { data: { task_id: task }, error: null }
          : {
              data: null,
              error: {
                code: 'PT409',
                message: 'TASK_RECURRENCE_REQUEST_CONFLICT',
              },
            };
      }
    );
    const body = { operation: 'create', listId: list, receipt: token, spec };
    expect(await (await request(body)).json()).toEqual({ task_id: task });
    expect(await (await request(body)).json()).toEqual({ task_id: task });
    const conflict = await request({
      ...body,
      spec: { ...spec, template: { ...spec.template, title: 'Different' } },
    });
    expect(conflict.status).toBe(409);
    expect(mock.rpc.mock.calls[1]?.[1]).toMatchObject({
      ...receipt,
      p_actor: actor,
    });
    expect(mock.rpc.mock.calls[3]?.[1]).toMatchObject({
      ...receipt,
      p_actor: actor,
    });
  });

  it('preserves an atomic fourth-open conflict', async () => {
    mock.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'PT409', message: 'TASK_RECURRENCE_OPEN_CAPACITY' },
    });
    const response = await request(completion());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'TASK_RECURRENCE_OPEN_CAPACITY',
    });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
});
