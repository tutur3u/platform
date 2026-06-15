import { describe, expect, it, vi } from 'vitest';
import {
  publishBoardListRealtime,
  publishTaskRealtime,
} from './realtime-broadcast';

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
  const channels: Array<{
    channel: { send: ReturnType<typeof vi.fn> };
    name: string;
    options: unknown;
  }> = [];

  const sbAdmin = {
    channel: vi.fn((name: string, options: unknown) => {
      const channel = { send: vi.fn(async () => 'ok') };
      channels.push({ channel, name, options });
      return channel;
    }),
    from: vi.fn((table: string) =>
      createThenableQuery(results[table] ?? { data: [], error: null })
    ),
    removeChannel: vi.fn(async () => 'ok'),
  };

  return { channels, sbAdmin };
}

const privateTaskRealtimeChannelConfig = {
  config: {
    broadcast: { self: false },
    private: true,
  },
};

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

    expect(sbAdmin.channel).toHaveBeenCalledWith(
      'board-realtime-22222222-2222-4222-8222-222222222222',
      privateTaskRealtimeChannelConfig
    );
    expect(sbAdmin.channel).toHaveBeenCalledWith(
      'task-user-realtime-11111111-1111-4111-8111-111111111111',
      privateTaskRealtimeChannelConfig
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

    expect(sbAdmin.channel).toHaveBeenCalledWith(
      'board-realtime-66666666-6666-4666-8666-666666666666',
      privateTaskRealtimeChannelConfig
    );
    expect(sbAdmin.channel).toHaveBeenCalledWith(
      'task-user-realtime-11111111-1111-4111-8111-111111111111',
      privateTaskRealtimeChannelConfig
    );
    expect(sbAdmin.channel).toHaveBeenCalledWith(
      'task-user-realtime-88888888-8888-4888-8888-888888888888',
      privateTaskRealtimeChannelConfig
    );
    expect(channels).toHaveLength(3);
  });
});
