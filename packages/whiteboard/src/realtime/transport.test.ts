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

  send(message: { event: string; payload: unknown }) {
    this.sent.push({ event: message.event, payload: message.payload });
    for (const peer of this.bus.get(this.topic) ?? []) {
      if (peer !== this && !peer.removed) {
        peer.listeners.get(message.event)?.({ payload: message.payload });
      }
    }
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
    expect(onStatus).toHaveBeenLastCalledWith('error', expect.any(Error));

    channels[1]?.statusCallback?.('TIMED_OUT');
    expect(onStatus).toHaveBeenLastCalledWith('error', expect.any(Error));
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

    expect(onStatus).toHaveBeenLastCalledWith('error', expect.any(Error));
  });
});
