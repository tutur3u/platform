import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => mocks,
}));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  withCronLogDrain: (_options: unknown, run: () => Promise<Response>) => run(),
}));

import { GET, shouldSkipDeadlineReminderTask } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'test-secret');
});

describe('shouldSkipDeadlineReminderTask', () => {
  const baseTask = {
    closed_at: null,
    completed_at: null,
    task_lists: {
      status: 'todo',
    },
  };

  it('skips tasks with closed_at', () => {
    expect(
      shouldSkipDeadlineReminderTask({
        ...baseTask,
        closed_at: '2026-03-28T00:00:00.000Z',
      })
    ).toBe(true);
  });

  it('skips tasks with completed_at', () => {
    expect(
      shouldSkipDeadlineReminderTask({
        ...baseTask,
        completed_at: '2026-03-28T00:00:00.000Z',
      })
    ).toBe(true);
  });

  it('skips tasks in done lists', () => {
    expect(
      shouldSkipDeadlineReminderTask({
        ...baseTask,
        task_lists: { status: 'done' },
      })
    ).toBe(true);
  });

  it('skips tasks in review lists', () => {
    expect(
      shouldSkipDeadlineReminderTask({
        ...baseTask,
        task_lists: { status: 'review' },
      })
    ).toBe(true);
  });

  it('skips tasks in closed lists', () => {
    expect(
      shouldSkipDeadlineReminderTask({
        ...baseTask,
        task_lists: { status: 'closed' },
      })
    ).toBe(true);
  });

  it('keeps active tasks eligible for reminders', () => {
    expect(shouldSkipDeadlineReminderTask(baseTask)).toBe(false);
  });
});

it('queues a reminder for a watched task in any workspace when push is the only enabled channel', async () => {
  const task = {
    id: 'task-id',
    name: 'Review launch',
    end_date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    closed_at: null,
    completed_at: null,
    task_lists: {
      board_id: 'board-id',
      status: 'todo',
      workspace_boards: {
        id: 'board-id',
        name: 'Launch',
        ws_id: 'non-root-workspace',
      },
    },
    task_watchers: [{ user_id: 'watcher-id' }],
  };
  const chain = (data: unknown) => {
    const query: Record<string, any> = {};
    for (const name of [
      'select',
      'not',
      'is',
      'gte',
      'lte',
      'order',
      'range',
    ]) {
      query[name] = vi.fn(() => query);
    }
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
    query.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve);
    return query;
  };
  mocks.from.mockImplementation((table: string) =>
    chain(table === 'workspace_task_reminder_settings' ? [] : [task])
  );
  mocks.rpc.mockImplementation((name: string) => {
    if (name === 'task_reminder_already_sent') {
      return Promise.resolve({ data: false, error: null });
    }
    if (name === 'create_notification') {
      return Promise.resolve({ data: 'notification-id', error: null });
    }
    return Promise.resolve({ data: 'receipt-id', error: null });
  });

  const response = await GET(
    new Request('http://localhost/api/cron/tasks/deadline-reminders', {
      headers: { authorization: 'Bearer test-secret' },
    }) as never
  );

  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith(
    'create_notification',
    expect.objectContaining({
      p_ws_id: 'non-root-workspace',
      p_user_id: 'watcher-id',
      p_type: 'deadline_reminder',
    })
  );
  expect(mocks.rpc).not.toHaveBeenCalledWith(
    'should_send_notification',
    expect.anything()
  );
});
