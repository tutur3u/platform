import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadTaskRealtimeFanoutContext,
  publishBoardListRealtime,
  publishTaskRealtime,
} from './realtime-broadcast';

const readScope = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/utils/task-read-scope', () => ({
  loadTaskReadScope: readScope,
}));
const publisher = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/realtime/channels/server', () => ({
  publishChannelBroadcast: publisher,
}));
beforeEach(() => {
  publisher.mockReset();
  readScope.mockReset();
  readScope.mockResolvedValue({ mode: 'workspace' });
});
afterEach(() => vi.useRealTimers());

type QueryResult = {
  data: unknown;
  error?: unknown;
};

function createThenableQuery(result: QueryResult) {
  const query = {
    in: vi.fn(() => query),
    select: vi.fn(() => query),
  };

  Object.defineProperty(query, 'then', {
    value: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  });

  return query;
}

function createRealtimeSupabaseMock(results: Record<string, QueryResult>) {
  const channels: string[] = [];
  publisher.mockImplementation(async (topic: string) => {
    channels.push(topic);
  });
  const sbAdmin = {
    from: vi.fn((table: string) =>
      createThenableQuery(results[table] ?? { data: [], error: null })
    ),
  };

  return { channels, sbAdmin };
}

describe('task realtime broadcast fanout', () => {
  it('publishes board list events on private realtime channels', async () => {
    const { channels, sbAdmin } = createRealtimeSupabaseMock({});

    await publishBoardListRealtime({
      actorUserId: '11111111-1111-4111-8111-111111111111',
      boardId: '22222222-2222-4222-8222-222222222222',
      event: 'list:upsert',
      list: { id: '33333333-3333-4333-8333-333333333333' },
      sbAdmin: sbAdmin as never,
    });

    expect(publisher).toHaveBeenCalledWith(
      'board-realtime-22222222-2222-4222-8222-222222222222',
      expect.objectContaining({ type: 'broadcast' })
    );
    expect(publisher).toHaveBeenCalledWith(
      'task-user-realtime-11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ type: 'broadcast' })
    );
    expect(channels).toHaveLength(2);
  });

  it('publishes task fanout events on private realtime channels', async () => {
    const { channels, sbAdmin } = createRealtimeSupabaseMock({
      tasks: {
        data: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            list_id: '55555555-5555-4555-8555-555555555555',
            task_lists: {
              board_id: '66666666-6666-4666-8666-666666666666',
              workspace_boards: {
                id: '66666666-6666-4666-8666-666666666666',
                name: 'Launch',
                ticket_prefix: 'LA',
                ws_id: '77777777-7777-4777-8777-777777777777',
              },
            },
          },
        ],
      },
      task_user_overrides: {
        data: [
          {
            personal_board_id: null,
            personal_list_id: null,
            task_id: '44444444-4444-4444-8444-444444444444',
            user_id: '88888888-8888-4888-8888-888888888888',
          },
        ],
      },
    });

    await publishTaskRealtime({
      actorUserId: '11111111-1111-4111-8111-111111111111',
      event: 'task:upsert',
      sbAdmin: sbAdmin as never,
      taskIds: ['44444444-4444-4444-8444-444444444444'],
    });

    expect(publisher).toHaveBeenCalledWith(
      'board-realtime-66666666-6666-4666-8666-666666666666',
      expect.objectContaining({ type: 'broadcast' })
    );
    expect(publisher).toHaveBeenCalledWith(
      'task-user-realtime-11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ type: 'broadcast' })
    );
    expect(publisher).toHaveBeenCalledWith(
      'task-user-realtime-88888888-8888-4888-8888-888888888888',
      expect.objectContaining({ type: 'broadcast' })
    );
    expect(channels).toHaveLength(3);
  });
});

describe('published-client realtime transition', () => {
  const publish = (sbAdmin: unknown, logWarning = vi.fn()) =>
    publishBoardListRealtime({
      actorUserId: '11111111-1111-4111-8111-111111111111',
      boardId: '22222222-2222-4222-8222-222222222222',
      event: 'list:upsert',
      list: { id: '33333333-3333-4333-8333-333333333333' },
      sbAdmin: sbAdmin as never,
      logWarning,
    });
  const legacy = () => {
    const send = vi.fn().mockResolvedValue('ok');
    const channel = { send };
    const sbAdmin = {
      channel: vi
        .fn<(name: string, options: unknown) => typeof channel>()
        .mockReturnValue(channel),
      removeChannel: vi.fn().mockResolvedValue('ok'),
    };
    return { send, channel, sbAdmin };
  };

  it('publishes identical authorized events to both transports and cleans private legacy channels', async () => {
    publisher.mockResolvedValue(undefined);
    const { send, channel, sbAdmin } = legacy();
    await publish(sbAdmin);
    expect(sbAdmin.channel.mock.calls.map(([name]) => name)).toEqual(
      publisher.mock.calls.map(([name]) => name)
    );
    expect(sbAdmin.channel).toHaveBeenCalledWith(expect.any(String), {
      config: { broadcast: { self: false }, private: true },
    });
    expect(send.mock.calls.map(([message]) => message)).toEqual(
      publisher.mock.calls.map(([, message]) => message)
    );
    expect(sbAdmin.removeChannel).toHaveBeenCalledWith(channel);
    expect(sbAdmin.removeChannel).toHaveBeenCalledTimes(2);
  });

  it('still serves released clients when Cloudflare fails', async () => {
    publisher.mockRejectedValue(new Error('Synthetic Cloudflare outage'));
    const { send, sbAdmin } = legacy();
    const warning = vi.fn();
    await expect(publish(sbAdmin, warning)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ transport: 'cloudflare' })
    );
  });

  it('still serves new clients when legacy publication fails', async () => {
    publisher.mockResolvedValue(undefined);
    const { send, sbAdmin } = legacy();
    send.mockRejectedValue(new Error('Synthetic legacy outage'));
    await expect(publish(sbAdmin)).resolves.toBeUndefined();
    expect(publisher).toHaveBeenCalledTimes(2);
    expect(sbAdmin.removeChannel).toHaveBeenCalledTimes(2);
  });

  it('bounds hanging publication and legacy cleanup independently', async () => {
    vi.useFakeTimers();
    publisher.mockImplementation(() => new Promise(() => {}));
    const { send, sbAdmin } = legacy();
    send.mockImplementation(() => new Promise(() => {}));
    sbAdmin.removeChannel.mockImplementation(() => new Promise(() => {}));
    const result = publish(sbAdmin);
    await vi.advanceTimersByTimeAsync(10001);
    await expect(result).resolves.toBeUndefined();
    expect(sbAdmin.removeChannel).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('personal recipient authorization', () => {
  const task = (id: string, boardId: string) => ({
    id,
    list_id: `list-${id}`,
    task_lists: {
      board_id: boardId,
      workspace_boards: {
        id: boardId,
        ws_id: 'source-workspace',
        name: 'Source',
        ticket_prefix: null,
      },
    },
  });
  it('does not deliver task data to a user whose override outlived source access', async () => {
    readScope.mockResolvedValue({ mode: 'boards', boardIds: [] });
    const { sbAdmin } = createRealtimeSupabaseMock({
      tasks: { data: [task('private-task', 'private-board')] },
      task_user_overrides: {
        data: [
          {
            task_id: 'private-task',
            user_id: 'outsider',
            personal_board_id: null,
            personal_list_id: null,
          },
        ],
      },
    });
    const fanout = await loadTaskRealtimeFanoutContext({
      sbAdmin: sbAdmin as never,
      taskIds: ['private-task'],
    });
    expect(fanout.userIds).not.toContain('outsider');
    expect(fanout.placementsByTaskId.get('private-task') ?? []).toEqual([]);
  });
  it('keeps an explicit source-board share usable', async () => {
    readScope.mockResolvedValue({ mode: 'boards', boardIds: ['shared-board'] });
    const { sbAdmin } = createRealtimeSupabaseMock({
      tasks: { data: [task('shared-task', 'shared-board')] },
      task_user_overrides: {
        data: [
          {
            task_id: 'shared-task',
            user_id: 'guest',
            personal_board_id: null,
            personal_list_id: null,
          },
        ],
      },
    });
    const fanout = await loadTaskRealtimeFanoutContext({
      sbAdmin: sbAdmin as never,
      taskIds: ['shared-task'],
    });
    expect(fanout.userIds).toContain('guest');
  });
  it('does not send another task in a batch to a recipient of only one task', async () => {
    const { sbAdmin } = createRealtimeSupabaseMock({
      tasks: { data: [task('task-a', 'board-a'), task('task-b', 'board-b')] },
      task_user_overrides: { data: [] },
    });
    await publishTaskRealtime({
      sbAdmin: sbAdmin as never,
      taskIds: ['task-a', 'task-b'],
      payload: { taskIds: ['task-a', 'task-b'] },
      event: 'task:upsert',
      taskPayloadsById: new Map([
        ['task-a', { description: 'A' }],
        ['task-b', { description: 'B' }],
      ]),
    });
    const messages = publisher.mock.calls.filter(
      ([topic]) => topic === 'board-realtime-board-a'
    );
    expect(messages.length).toBeGreaterThan(0);
    for (const [, message] of messages)
      expect(JSON.stringify(message)).not.toContain('task-b');
  });
});

it('keeps one publication per channel for a same-board batch', async () => {
  const { sbAdmin } = createRealtimeSupabaseMock({
    tasks: {
      data: ['one', 'two'].map((id) => ({
        id,
        list_id: 'list',
        task_lists: {
          board_id: 'board',
          workspace_boards: {
            id: 'board',
            ws_id: 'workspace',
            name: 'Board',
            ticket_prefix: null,
          },
        },
      })),
    },
    task_user_overrides: { data: [] },
  });
  await publishTaskRealtime({
    sbAdmin: sbAdmin as never,
    event: 'task:upsert',
    taskIds: ['one', 'two'],
  });
  expect(publisher).toHaveBeenCalledTimes(1);
  expect(publisher).toHaveBeenCalledWith(
    'board-realtime-board',
    expect.objectContaining({
      event: 'task:upsert:batch',
      payload: expect.objectContaining({ taskIds: ['one', 'two'] }),
    })
  );
});
