import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSmartSchedulingTasks } from './load-smart-scheduling-tasks';

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => mocks);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const task = {
  task_id: 'task-a',
  task_name: 'Plan',
  task_list_id: 'list-a' as string | null,
  task_end_date: '2026-10-07T10:00:00Z',
  task_priority: 'normal',
};
function harness() {
  const rpcRead = deferred<{ data: (typeof task)[] | null }>();
  const listRead = deferred<{ data: unknown[] | null }>();
  const settingsRead = deferred<{ data: unknown[] | null }>();
  const lists = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn(() => listRead.promise),
  };
  const settings = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn(() => settingsRead.promise),
  };
  const client = {
    rpc: vi.fn(() => rpcRead.promise),
    from: vi.fn((table: string) => {
      if (table === 'task_lists') return lists;
      if (table === 'task_user_scheduling_settings') return settings;
      throw new Error('Unexpected source');
    }),
  };
  mocks.createAdminClient.mockResolvedValue(client);
  return { client, lists, settings, rpcRead, listRead, settingsRead };
}
beforeEach(() => vi.clearAllMocks());
describe('smart-scheduling server startup reads', () => {
  it('starts both enrichment reads after accessible IDs arrive, while list metadata is still unresolved', async () => {
    const h = harness();
    const result = loadSmartSchedulingTasks({
      resolvedWsId: 'workspace',
      userId: 'actor',
    });
    await vi.waitFor(() => expect(h.client.rpc).toHaveBeenCalled());
    expect(h.client.from).not.toHaveBeenCalled();
    expect(h.client.rpc).toHaveBeenCalledWith('get_user_accessible_tasks', {
      p_user_id: 'actor',
      p_ws_id: 'workspace',
      p_include_deleted: false,
      p_list_statuses: ['not_started', 'active'],
    });
    h.rpcRead.resolve({ data: [task] });
    await vi.waitFor(() =>
      expect(h.settings.in).toHaveBeenCalledWith('task_id', ['task-a'])
    );
    expect(h.lists.in).toHaveBeenCalledWith('id', ['list-a']);
    expect(h.settings.eq).toHaveBeenCalledWith('user_id', 'actor');
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    h.settingsRead.resolve({
      data: [
        {
          task_id: 'task-a',
          total_duration: 90,
          auto_schedule: true,
          is_splittable: true,
          calendar_hours: 'work_hours',
        },
      ],
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    h.listRead.resolve({
      data: [{ id: 'list-a', workspace_boards: { ws_id: 'source-workspace' } }],
    });
    expect(await result).toEqual([
      expect.objectContaining({
        id: 'task-a',
        ws_id: 'source-workspace',
        due_date: task.task_end_date,
        total_duration: 90,
        is_splittable: true,
        auto_schedule: true,
        calendar_hours: 'work_hours',
      }),
    ]);
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
  });
  it('deduplicates list IDs and retains tasks without scheduling settings', async () => {
    const h = harness();
    h.rpcRead.resolve({ data: [task, { ...task, task_id: 'task-b' }] });
    h.listRead.resolve({
      data: [{ id: 'list-a', workspace_boards: { ws_id: 'workspace' } }],
    });
    h.settingsRead.resolve({
      data: [
        {
          task_id: 'task-a',
          total_duration: null,
          is_splittable: null,
          auto_schedule: null,
        },
      ],
    });
    const rows = await loadSmartSchedulingTasks({
      resolvedWsId: 'workspace',
      userId: 'actor',
    });
    expect(h.lists.in).toHaveBeenCalledWith('id', ['list-a']);
    expect(h.settings.in).toHaveBeenCalledWith('task_id', ['task-a', 'task-b']);
    expect(rows[0]).toMatchObject({
      is_splittable: false,
      auto_schedule: false,
      min_split_duration_minutes: null,
    });
    expect(rows[1]).not.toHaveProperty('auto_schedule');
  });
  it.each([{ data: [] }, { data: null }])(
    'does not request broad enrichment tables when no accessible tasks exist (%s)',
    async ({ data }) => {
      const h = harness();
      h.rpcRead.resolve({ data });
      expect(
        await loadSmartSchedulingTasks({
          resolvedWsId: 'workspace',
          userId: 'actor',
        })
      ).toEqual([]);
      expect(h.client.from).not.toHaveBeenCalled();
    }
  );
  it('skips list lookup for tasks without a list and preserves workspace fallback', async () => {
    const h = harness();
    h.rpcRead.resolve({
      data: [{ ...task, task_list_id: null }],
    });
    h.settingsRead.resolve({ data: null });
    const rows = await loadSmartSchedulingTasks({
      resolvedWsId: 'workspace',
      userId: 'actor',
    });
    expect(h.lists.in).not.toHaveBeenCalled();
    expect(rows[0]?.ws_id).toBe('workspace');
  });
  it('propagates rejected reads without publishing partial enriched results', async () => {
    const h = harness();
    h.rpcRead.resolve({ data: [task] });
    const result = loadSmartSchedulingTasks({
      resolvedWsId: 'workspace',
      userId: 'actor',
    });
    const rejection = expect(result).rejects.toThrow('list transport');
    await vi.waitFor(() => expect(h.settings.in).toHaveBeenCalled());
    h.listRead.reject(new Error('list transport'));
    h.settingsRead.resolve({ data: [] });
    await rejection;
  });
});
