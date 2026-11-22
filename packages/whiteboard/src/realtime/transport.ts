import type {
  CursorUpdate,
  ElementChangeBatch,
  SelectionUpdate,
  WhiteboardChannelKind,
  WhiteboardTransport,
  WhiteboardTransportHandlers,
} from '../adapters';

/** The slice of a realtime broadcast channel the transport depends on. */
export interface BroadcastChannelLike {
  on(
    type: 'broadcast',
    filter: { event: string },
    callback: (message: { payload: any }) => void
  ): BroadcastChannelLike;
  subscribe(callback: (status: string) => void): unknown;
  send(message: {
    type: 'broadcast';
    event: string;
    payload: unknown;
  }): Promise<unknown> | unknown;
}

export interface BroadcastClientLike<
  TChannel extends BroadcastChannelLike = BroadcastChannelLike,
> {
  channel(
    topic: string,
    options: { config: { broadcast: { self: boolean } } }
  ): TChannel;
  removeChannel(channel: TChannel): unknown;
}

export interface RealtimeWhiteboardTransportOptions<
  TChannel extends BroadcastChannelLike,
> {
  /** Base topic; the transport appends `-elements` and `-cursors`. */
  channelName: string;
  createClient: () => BroadcastClientLike<TChannel>;
  /** Delay before an unused connection is torn down, so a quick reconnect (such as React StrictMode's remount) reuses it. */
  disposeDelayMs?: number;
}

interface ActiveConnection<TChannel extends BroadcastChannelLike> {
  client: BroadcastClientLike<TChannel>;
  elements: TChannel;
  cursors: TChannel;
  handlers: WhiteboardTransportHandlers;
  elementsReady: boolean;
  cursorsReady: boolean;
}

const ELEMENT_EVENT = 'element-changes';
const CURSOR_EVENT = 'cursor-move';
const SELECTION_EVENT = 'selection-change';
const HIDDEN_CURSOR = -1000;

/**
 * Whiteboard transport over two broadcast channels: one for element deltas and
 * one for cursors and selections. It reports `connected` only while both are
 * subscribed, and defers teardown so a disconnect immediately followed by a
 * connect keeps the same channels.
 *
 * It serves one consumer at a time. Reconnecting right after a disconnect hands
 * the open channels to the new consumer; connecting while another consumer is
 * still attached throws instead of tearing that consumer down.
 */
export function createRealtimeWhiteboardTransport<
  TChannel extends BroadcastChannelLike,
>({
  channelName,
  createClient,
  disposeDelayMs = 100,
}: RealtimeWhiteboardTransportOptions<TChannel>): WhiteboardTransport {
  let active: ActiveConnection<TChannel> | null = null;
  let disposeTimer: ReturnType<typeof setTimeout> | null = null;

  const toError = (error: unknown) =>
    error instanceof Error ? error : new Error(String(error));

  const guard = (
    connection: ActiveConnection<TChannel>,
    channel: WhiteboardChannelKind,
    deliver: (handlers: WhiteboardTransportHandlers) => void
  ) => {
    try {
      deliver(connection.handlers);
    } catch (error) {
      connection.handlers.onStatus('error', toError(error), channel);
    }
  };

  const reportStatus = (
    connection: ActiveConnection<TChannel>,
    channel: WhiteboardChannelKind,
    status: string
  ) => {
    const { handlers } = connection;
    const label = channel === 'elements' ? 'Channel' : 'Cursor channel';
    switch (status) {
      case 'CHANNEL_ERROR':
        handlers.onStatus('error', new Error(`${label} error`), channel);
        return;
      case 'TIMED_OUT':
        handlers.onStatus('error', new Error(`${label} timed out`), channel);
        return;
      default:
        handlers.onStatus(
          connection.elementsReady && connection.cursorsReady
            ? 'connected'
            : 'disconnected'
        );
    }
  };

  const open = (handlers: WhiteboardTransportHandlers) => {
    const client = createClient();
    const config = { config: { broadcast: { self: false } } };
    const elements = client.channel(`${channelName}-elements`, config);
    const cursors = client.channel(`${channelName}-cursors`, config);
    const connection: ActiveConnection<TChannel> = {
      client,
      elements,
      cursors,
      handlers,
      elementsReady: false,
      cursorsReady: false,
    };

    elements
      .on('broadcast', { event: ELEMENT_EVENT }, (message) =>
        guard(connection, 'elements', (h) =>
          h.onElementChanges(message.payload as ElementChangeBatch)
        )
      )
      .subscribe((status) => {
        connection.elementsReady = status === 'SUBSCRIBED';
        reportStatus(connection, 'elements', status);
      });

    cursors
      .on('broadcast', { event: CURSOR_EVENT }, (message) =>
        guard(connection, 'cursors', (h) =>
          h.onCursor(message.payload as CursorUpdate)
        )
      )
      .on('broadcast', { event: SELECTION_EVENT }, (message) =>
        guard(connection, 'cursors', (h) =>
          h.onSelection(message.payload as SelectionUpdate)
        )
      )
      .subscribe((status) => {
        connection.cursorsReady = status === 'SUBSCRIBED';
        reportStatus(connection, 'cursors', status);
      });

    handlers.onStatus('connecting');
    return connection;
  };

  const dispose = async (connection: ActiveConnection<TChannel>) => {
    const { user } = connection.handlers;

    // Tell peers to drop this client's cursor and selection, and let those
    // sends settle before the channels close so they actually go out.
    const departures = [
      {
        event: CURSOR_EVENT,
        payload: { x: HIDDEN_CURSOR, y: HIDDEN_CURSOR, user },
      },
      {
        event: SELECTION_EVENT,
        payload: {
          senderId: user.id,
          selectedElementIds: {},
          timestamp: Date.now(),
        },
      },
    ].map(async ({ event, payload }) => {
      await connection.cursors.send({ type: 'broadcast', event, payload });
    });
    await Promise.allSettled(departures);

    void connection.client.removeChannel(connection.elements);
    void connection.client.removeChannel(connection.cursors);
  };

  const send = async (
    pick: (connection: ActiveConnection<TChannel>) => TChannel,
    event: string,
    payload: unknown
  ) => {
    if (!active) return;
    await pick(active).send({ type: 'broadcast', event, payload });
  };

  return {
    connect(handlers) {
      if (disposeTimer && active) {
        clearTimeout(disposeTimer);
        disposeTimer = null;
        active.handlers = handlers;
        handlers.onStatus(
          active.elementsReady && active.cursorsReady
            ? 'connected'
            : 'connecting'
        );
      } else if (active) {
        throw new Error(
          'Whiteboard transport already has an active consumer; create one transport per editor.'
        );
      } else {
        active = open(handlers);
      }

      const connection = active;
      let disconnected = false;

      return () => {
        // A consumer that was replaced, or already left, must not schedule teardown.
        if (disconnected || connection.handlers !== handlers) return;
        disconnected = true;

        disposeTimer = setTimeout(() => {
          disposeTimer = null;
          if (active === connection) {
            active = null;
            void dispose(connection);
          }
        }, disposeDelayMs);
      };
    },
    sendElementChanges: (batch) =>
      send((c) => c.elements, ELEMENT_EVENT, batch),
    sendCursor: (update) => send((c) => c.cursors, CURSOR_EVENT, update),
    sendSelection: (update) => send((c) => c.cursors, SELECTION_EVENT, update),
  };
}
