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
      'or',
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
  let workspaceSettings: unknown[] = [];
  let taskQuery: Record<string, any>;
  mocks.from.mockImplementation((table: string) => {
    if (table === 'workspace_task_reminder_settings') {
      return chain(workspaceSettings);
    }
    taskQuery = chain([task]);
    return taskQuery;
  });
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
  expect(taskQuery!.or).toHaveBeenCalledWith(
    expect.stringContaining('end_date.gte."')
  );
  const receiptKey = `1h:${task.end_date}`;
  expect(mocks.rpc).toHaveBeenCalledWith(
    'task_reminder_already_sent',
    expect.objectContaining({ p_reminder_interval: receiptKey })
  );
  expect(mocks.rpc).toHaveBeenCalledWith(
    'record_task_reminder_sent',
    expect.objectContaining({
      p_reminder_interval: receiptKey,
      p_notification_id: 'notification-id',
    })
  );

  mocks.rpc.mockClear();
  workspaceSettings = [
    {
      ws_id: 'non-root-workspace',
      reminder_intervals: ['1h'],
      enabled: false,
    },
  ];
  const disabledResponse = await GET(
    new Request('http://localhost/api/cron/tasks/deadline-reminders', {
      headers: { authorization: 'Bearer test-secret' },
    }) as never
  );
  expect(disabledResponse.status).toBe(200);
  expect(mocks.rpc).not.toHaveBeenCalledWith(
    'create_notification',
    expect.anything()
  );
});
