import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  publishBoardListRealtime,
  publishTaskRealtime,
} from './realtime-broadcast';

const publisher = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/realtime/channels/server', () => ({
  publishChannelBroadcast: publisher,
}));
beforeEach(() => {
  publisher.mockReset();
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
      channel: vi.fn((_name: string, _options: unknown) => channel),
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
