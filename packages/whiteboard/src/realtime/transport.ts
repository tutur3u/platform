import type {
  CursorUpdate,
  ElementChangeBatch,
  SelectionUpdate,
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

  const reportStatus = (
    connection: ActiveConnection<TChannel>,
    status: string,
    label: string
  ) => {
    const { handlers } = connection;
    switch (status) {
      case 'CHANNEL_ERROR':
        handlers.onStatus('error', new Error(`${label} error`));
        return;
      case 'TIMED_OUT':
        handlers.onStatus('error', new Error(`${label} timed out`));
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
      .on('broadcast', { event: ELEMENT_EVENT }, (message) => {
        try {
          connection.handlers.onElementChanges(
            message.payload as ElementChangeBatch
          );
        } catch (error) {
          connection.handlers.onStatus(
            'error',
            error instanceof Error ? error : new Error(String(error))
          );
        }
      })
      .subscribe((status) => {
        connection.elementsReady = status === 'SUBSCRIBED';
        reportStatus(connection, status, 'Channel');
      });

    cursors
      .on('broadcast', { event: CURSOR_EVENT }, (message) => {
        try {
          connection.handlers.onCursor(message.payload as CursorUpdate);
        } catch (error) {
          connection.handlers.onStatus(
            'error',
            error instanceof Error ? error : new Error(String(error))
          );
        }
      })
      .on('broadcast', { event: SELECTION_EVENT }, (message) => {
        try {
          connection.handlers.onSelection(message.payload as SelectionUpdate);
        } catch (error) {
          connection.handlers.onStatus(
            'error',
            error instanceof Error ? error : new Error(String(error))
          );
        }
      })
      .subscribe((status) => {
        connection.cursorsReady = status === 'SUBSCRIBED';
        reportStatus(connection, status, 'Cursor channel');
      });

    handlers.onStatus('connecting');
    return connection;
  };

  const dispose = (connection: ActiveConnection<TChannel>) => {
    const { user } = connection.handlers;

    // Best effort: tell peers to drop this client's cursor and selection.
    try {
      void connection.cursors.send({
        type: 'broadcast',
        event: CURSOR_EVENT,
        payload: { x: HIDDEN_CURSOR, y: HIDDEN_CURSOR, user },
      });
      void connection.cursors.send({
        type: 'broadcast',
        event: SELECTION_EVENT,
        payload: {
          senderId: user.id,
          selectedElementIds: {},
          timestamp: Date.now(),
        },
      });
    } catch {
      // The connection is going away; there is nobody to tell.
    }

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
      } else {
        if (active) dispose(active);
        active = open(handlers);
      }

      const connection = active;

      return () => {
        if (disposeTimer) clearTimeout(disposeTimer);
        disposeTimer = setTimeout(() => {
          disposeTimer = null;
          if (active === connection) {
            active = null;
            dispose(connection);
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
