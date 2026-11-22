import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WhiteboardTransportHandlers } from '../adapters';
import { expectTransportContract } from '../testing/contracts';
import { makeElement } from '../testing/fixtures';
import {
  type BroadcastChannelLike,
  type BroadcastClientLike,
  createRealtimeWhiteboardTransport,
} from './transport';

type Listener = (message: { payload: unknown }) => void;

class FakeChannel implements BroadcastChannelLike {
  listeners = new Map<string, Listener>();
  statusCallback: ((status: string) => void) | null = null;
  sent: { event: string; payload: unknown }[] = [];
  removed = false;

  constructor(
    readonly topic: string,
    private bus: Map<string, FakeChannel[]>
  ) {
    bus.set(topic, [...(bus.get(topic) ?? []), this]);
  }

  on(_type: 'broadcast', filter: { event: string }, callback: Listener) {
    this.listeners.set(filter.event, callback);
    return this;
  }

  subscribe(callback: (status: string) => void) {
    this.statusCallback = callback;
    callback('SUBSCRIBED');
  }

  sendHook: (() => Promise<unknown>) | null = null;

  send(message: { event: string; payload: unknown }) {
    this.sent.push({ event: message.event, payload: message.payload });
    const hooked = this.sendHook?.();
    for (const peer of this.bus.get(this.topic) ?? []) {
      if (peer !== this && !peer.removed) {
        peer.listeners.get(message.event)?.({ payload: message.payload });
      }
    }
    return hooked;
  }
}

function createFakeClient(bus = new Map<string, FakeChannel[]>()) {
  const channels: FakeChannel[] = [];
  const client: BroadcastClientLike<FakeChannel> = {
    channel(topic) {
      const channel = new FakeChannel(topic, bus);
      channels.push(channel);
      return channel;
    },
    removeChannel(channel) {
      channel.removed = true;
    },
  };
  return { client, channels, bus };
}

const handlers = (
  overrides: Partial<WhiteboardTransportHandlers> = {}
): WhiteboardTransportHandlers => ({
  user: { id: 'me', displayName: 'Me' },
  onStatus: vi.fn(),
  onElementChanges: vi.fn(),
  onCursor: vi.fn(),
  onSelection: vi.fn(),
  ...overrides,
});

describe('createRealtimeWhiteboardTransport', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('satisfies the transport contract between two clients on one board', async () => {
    const bus = new Map<string, FakeChannel[]>();
    const make = () =>
      createRealtimeWhiteboardTransport({
        channelName: 'board-1',
        createClient: () => createFakeClient(bus).client,
      });

    await expectTransportContract(make(), make(), async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
  });

  it('opens an elements channel and a cursors channel without self echo', () => {
    const { client, channels } = createFakeClient();
    const transport = createRealtimeWhiteboardTransport({
      channelName: 'board-1',
      createClient: () => client,
    });

    transport.connect(handlers());

    expect(channels.map((c) => c.topic)).toEqual([
      'board-1-elements',
      'board-1-cursors',
    ]);
  });

  it('reports connected only once both channels are subscribed', () => {
    const onStatus = vi.fn();
    const channels: FakeChannel[] = [];
    const client: BroadcastClientLike<FakeChannel> = {
      channel(topic) {
        const channel = new FakeChannel(topic, new Map());
        channel.subscribe = (callback) => {
          channel.statusCallback = callback;
        };
        channels.push(channel);
        return channel;
      },
      removeChannel() {},
    };

    createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    }).connect(handlers({ onStatus }));

    channels[0]?.statusCallback?.('SUBSCRIBED');
    expect(onStatus).toHaveBeenLastCalledWith('disconnected');

    channels[1]?.statusCallback?.('SUBSCRIBED');
    expect(onStatus).toHaveBeenLastCalledWith('connected');

    channels[1]?.statusCallback?.('CLOSED');
    expect(onStatus).toHaveBeenLastCalledWith('disconnected');
  });

  it('surfaces channel errors and timeouts as error statuses', () => {
    const onStatus = vi.fn();
    const { client, channels } = createFakeClient();

    createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    }).connect(handlers({ onStatus }));

    channels[0]?.statusCallback?.('CHANNEL_ERROR');
    expect(onStatus).toHaveBeenLastCalledWith(
      'error',
      expect.any(Error),
      'elements'
    );

    channels[1]?.statusCallback?.('TIMED_OUT');
    expect(onStatus).toHaveBeenLastCalledWith(
      'error',
      expect.any(Error),
      'cursors'
    );
  });

  it('reuses the connection when reconnected within the dispose delay', async () => {
    const { client, channels } = createFakeClient();
    const transport = createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    });

    const first = transport.connect(handlers());
    first();
    const onElementChanges = vi.fn();
    transport.connect(handlers({ onElementChanges }));
    await vi.advanceTimersByTimeAsync(500);

    expect(channels).toHaveLength(2);
    expect(channels.every((c) => !c.removed)).toBe(true);

    channels[0]?.listeners.get('element-changes')?.({
      payload: { senderId: 'x', changes: [], timestamp: 1 },
    });
    expect(onElementChanges).toHaveBeenCalledOnce();
  });

  it('announces departure and removes both channels after the delay', async () => {
    const { client, channels } = createFakeClient();
    const transport = createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    });

    transport.connect(handlers())();
    await vi.advanceTimersByTimeAsync(500);

    expect(channels.every((c) => c.removed)).toBe(true);
    expect(channels[1]?.sent.map((s) => s.event)).toEqual([
      'cursor-move',
      'selection-change',
    ]);
    expect(channels[1]?.sent[0]?.payload).toMatchObject({
      x: -1000,
      y: -1000,
      user: { id: 'me' },
    });
  });

  it('drops sends while disconnected instead of throwing', async () => {
    const { client } = createFakeClient();
    const transport = createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    });

    await expect(
      transport.sendElementChanges({
        senderId: 'me',
        changes: [{ element: makeElement('a'), type: 'insert' }],
        timestamp: 1,
      })
    ).resolves.toBeUndefined();
  });

  it('turns a throwing handler into an error status', () => {
    const onStatus = vi.fn();
    const { client, channels } = createFakeClient();

    createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    }).connect(
      handlers({
        onStatus,
        onCursor: () => {
          throw new Error('boom');
        },
      })
    );

    channels[1]?.listeners.get('cursor-move')?.({ payload: {} });

    expect(onStatus).toHaveBeenLastCalledWith(
      'error',
      expect.any(Error),
      'cursors'
    );
  });

  it('tags channel errors so hosts can tell element failures from cursor failures', () => {
    const onStatus = vi.fn();
    const { client, channels } = createFakeClient();

    createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    }).connect(handlers({ onStatus }));

    channels[0]?.statusCallback?.('CHANNEL_ERROR');
    expect(onStatus).toHaveBeenLastCalledWith(
      'error',
      expect.any(Error),
      'elements'
    );

    channels[1]?.statusCallback?.('TIMED_OUT');
    expect(onStatus).toHaveBeenLastCalledWith(
      'error',
      expect.any(Error),
      'cursors'
    );
  });

  it('tags errors thrown by a handler with the channel it arrived on', () => {
    const onStatus = vi.fn();
    const { client, channels } = createFakeClient();

    createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    }).connect(
      handlers({
        onStatus,
        onElementChanges: () => {
          throw new Error('boom');
        },
      })
    );

    channels[0]?.listeners.get('element-changes')?.({ payload: {} });

    expect(onStatus).toHaveBeenLastCalledWith(
      'error',
      expect.any(Error),
      'elements'
    );
  });

  it('replays the current status to a consumer that takes over the open channels', async () => {
    const { client } = createFakeClient();
    const transport = createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    });

    transport.connect(handlers())();
    const onStatus = vi.fn();
    transport.connect(handlers({ onStatus }));

    expect(onStatus).toHaveBeenCalledWith('connected');
  });

  it('replays connecting when the channels are not both subscribed yet', () => {
    const channels: FakeChannel[] = [];
    const client: BroadcastClientLike<FakeChannel> = {
      channel(topic) {
        const channel = new FakeChannel(topic, new Map());
        channel.subscribe = (callback) => {
          channel.statusCallback = callback;
        };
        channels.push(channel);
        return channel;
      },
      removeChannel() {},
    };
    const transport = createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    });

    transport.connect(handlers())();
    const onStatus = vi.fn();
    transport.connect(handlers({ onStatus }));

    expect(onStatus).toHaveBeenCalledWith('connecting');
  });

  it('refuses a second consumer while the first is attached', () => {
    const { client, channels } = createFakeClient();
    const transport = createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    });
    const first = handlers();

    transport.connect(first);

    expect(() => transport.connect(handlers())).toThrow(
      /already has an active consumer/
    );
    expect(channels.every((c) => !c.removed)).toBe(true);
  });

  it('ignores a disconnect from a consumer that was already replaced', async () => {
    const { client, channels } = createFakeClient();
    const transport = createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    });

    const staleDisconnect = transport.connect(handlers());
    staleDisconnect();
    transport.connect(handlers());
    staleDisconnect();
    await vi.advanceTimersByTimeAsync(500);

    expect(channels.every((c) => !c.removed)).toBe(true);
  });

  it('closes the elements channel at once and the cursors channel after its departures settle', async () => {
    const { client, channels } = createFakeClient();
    const transport = createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    });
    const release: (() => void)[] = [];

    transport.connect(handlers())();
    channels[1]!.sendHook = () =>
      new Promise<void>((resolve) => release.push(resolve));
    await vi.advanceTimersByTimeAsync(150);

    expect(channels[1]!.sent).toHaveLength(2);
    expect(channels[0]!.removed).toBe(true);
    expect(channels[1]!.removed).toBe(false);

    for (const done of release) done();
    await vi.advanceTimersByTimeAsync(0);

    expect(channels[1]!.removed).toBe(true);
  });

  it('stops waiting for departure messages after one second', async () => {
    const { client, channels } = createFakeClient();
    const transport = createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    });

    transport.connect(handlers())();
    channels[1]!.sendHook = () => new Promise<void>(() => {});
    await vi.advanceTimersByTimeAsync(150);
    expect(channels[1]!.removed).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(channels[1]!.removed).toBe(true);
  });

  it('skips departure messages when the cursors channel never joined', async () => {
    const channels: FakeChannel[] = [];
    const client: BroadcastClientLike<FakeChannel> = {
      channel(topic) {
        const channel = new FakeChannel(topic, new Map());
        channel.subscribe = (callback) => {
          channel.statusCallback = callback;
          if (topic.endsWith('-elements')) callback('SUBSCRIBED');
        };
        channels.push(channel);
        return channel;
      },
      removeChannel(channel) {
        channel.removed = true;
      },
    };
    const transport = createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    });

    transport.connect(handlers())();
    await vi.advanceTimersByTimeAsync(150);

    expect(channels[1]!.sent).toEqual([]);
    expect(channels.every((c) => c.removed)).toBe(true);
  });

  it('delivers nothing to a consumer from the moment it disconnects', () => {
    const { client, channels } = createFakeClient();
    const transport = createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    });
    const consumer = handlers();

    const disconnect = transport.connect(consumer);
    const statusCallsWhileConnected = vi.mocked(consumer.onStatus).mock.calls
      .length;
    disconnect();

    channels[0]!.listeners.get('element-changes')?.({ payload: {} });
    channels[1]!.listeners.get('cursor-move')?.({ payload: {} });
    channels[1]!.listeners.get('selection-change')?.({ payload: {} });
    channels[0]!.statusCallback?.('CHANNEL_ERROR');

    expect(consumer.onElementChanges).not.toHaveBeenCalled();
    expect(consumer.onCursor).not.toHaveBeenCalled();
    expect(consumer.onSelection).not.toHaveBeenCalled();
    expect(consumer.onStatus).toHaveBeenCalledTimes(statusCallsWhileConnected);
  });

  it('still names the departing user in departure messages', async () => {
    const { client, channels } = createFakeClient();
    const transport = createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    });

    transport.connect(handlers({ user: { id: 'zed', displayName: 'Zed' } }))();
    await vi.advanceTimersByTimeAsync(150);

    expect(channels[1]!.sent[0]?.payload).toMatchObject({
      user: { id: 'zed' },
    });
  });

  it('closes the channels without an unhandled rejection when a departure fails', async () => {
    const { client, channels } = createFakeClient();
    const transport = createRealtimeWhiteboardTransport({
      channelName: 'b',
      createClient: () => client,
    });

    transport.connect(handlers())();
    channels[1]!.sendHook = () => Promise.reject(new Error('gone'));
    await vi.advanceTimersByTimeAsync(150);

    expect(channels.every((c) => c.removed)).toBe(true);
  });
});
