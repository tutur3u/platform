import {
  BOARD_SOCKET_PROTOCOL,
  BOARD_TOKEN_PROTOCOL_PREFIX,
  boardServerMessage,
  type BoardMember,
  type BoardRole,
} from '@tuturuuu/realtime/meet/board-sync-schema';
import type {
  WhiteboardConnectionStatus,
  WhiteboardTransport,
  WhiteboardTransportHandlers,
} from '@tuturuuu/whiteboard';

export interface BoardSession {
  endpoint: string;
  token: string;
  role: BoardRole;
  refreshSeconds: number;
}

export interface BoardTransportOptions {
  /** Asks the Meet API for a fresh ticket; it rechecks access every time. */
  join: () => Promise<BoardSession>;
  onRole: (role: BoardRole) => void;
  onSaved?: () => void;
  onSaveError?: () => void;
  /** The room refused edits: the board is full, or the elements are unsupported. */
  onRejected?: (reason: 'size' | 'count' | 'unsupported') => void;
  /** The board was unlinked, archived, or access was withdrawn. */
  onClosed: () => void;
  createSocket?: (url: string, protocols: string[]) => WebSocket;
  /** Reconnect delays in milliseconds; the transport gives up after the last. */
  retryDelaysMs?: readonly number[];
}

export interface BoardTransport extends WhiteboardTransport {
  subscribePresence: NonNullable<WhiteboardTransport['subscribePresence']>;
}

const OPEN = 1;
const DEFAULT_RETRY = [1000, 2000, 5000, 10_000, 20_000] as const;

/**
 * Whiteboard transport over the room's whiteboard socket. It keeps one socket,
 * refreshes its ticket before expiry, and reconnects a bounded number of times
 * with growing delays; after that it reports an error and stays closed.
 */
export function createBoardSocketTransport(
  options: BoardTransportOptions
): BoardTransport {
  const retry = options.retryDelaysMs ?? DEFAULT_RETRY;
  const make =
    options.createSocket ??
    ((url: string, protocols: string[]) => new WebSocket(url, protocols));
  const listeners = new Set<(members: BoardMember[]) => void>();
  let socket: WebSocket | null = null;
  let handlers: WhiteboardTransportHandlers | null = null;
  let refresh: ReturnType<typeof setInterval> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let generation = 0;

  const status = (value: WhiteboardConnectionStatus, error?: Error) =>
    error ? handlers?.onStatus(value, error) : handlers?.onStatus(value);

  function stop() {
    generation++;
    if (refresh) clearInterval(refresh);
    if (retryTimer) clearTimeout(retryTimer);
    refresh = retryTimer = null;
    const current = socket;
    socket = null;
    if (current) {
      current.onmessage = current.onclose = current.onerror = null;
      current.close(1000);
    }
  }

  function dispatch(raw: unknown) {
    const parsed = boardServerMessage.safeParse(raw);
    if (!parsed.success || !handlers) return;
    const message = parsed.data;
    switch (message.type) {
      case 'sync':
        options.onRole(message.role);
        if (message.elements.length > 0)
          handlers.onElementChanges({
            senderId: 'system',
            timestamp: Date.now(),
            changes: message.elements.map((element) => ({
              type: 'insert',
              element: element as never,
            })),
          });
        return;
      case 'elements':
        handlers.onElementChanges({
          senderId: message.senderId,
          timestamp: message.timestamp,
          changes: message.changes as never,
        });
        return;
      case 'cursor':
        handlers.onCursor({
          x: message.x,
          y: message.y,
          tool: message.tool,
          user: { id: message.senderId, displayName: message.displayName },
        });
        return;
      case 'selection':
        handlers.onSelection({
          senderId: message.senderId,
          selectedElementIds: message.selectedElementIds,
          timestamp: message.timestamp,
        });
        return;
      case 'presence':
        for (const listener of listeners) listener(message.members);
        return;
      case 'role':
        options.onRole(message.role);
        return;
      case 'saved':
        options.onSaved?.();
        return;
      case 'save-error':
        options.onSaveError?.();
        return;
      case 'rejected':
        options.onRejected?.(message.reason);
        return;
      case 'closed':
        stop();
        status('disconnected');
        options.onClosed();
    }
  }

  async function open() {
    const mine = ++generation;
    status('connecting');
    let session: BoardSession;
    try {
      session = await options.join();
    } catch (error) {
      if (mine !== generation) return;
      // A refused ticket is final: the board is gone or access was withdrawn.
      const code = (error as { status?: number }).status;
      if (code === 403 || code === 404 || code === 410) {
        status('disconnected');
        options.onClosed();
        return;
      }
      return scheduleRetry(error instanceof Error ? error : new Error('join'));
    }
    if (mine !== generation) return;
    options.onRole(session.role);
    // The ticket travels as a subprotocol so it never lands in a URL log.
    const next = make(session.endpoint, [
      BOARD_SOCKET_PROTOCOL,
      `${BOARD_TOKEN_PROTOCOL_PREFIX}${session.token}`,
    ]);
    socket = next;
    next.onopen = () => {
      attempts = 0;
      status('connected');
      refresh = setInterval(() => void renew(), session.refreshSeconds * 1000);
    };
    next.onmessage = (event) => {
      try {
        dispatch(JSON.parse(String(event.data)));
      } catch {
        // A malformed frame is dropped; the socket stays open.
      }
    };
    next.onclose = () => {
      if (mine !== generation) return;
      if (refresh) clearInterval(refresh);
      refresh = null;
      socket = null;
      status('disconnected');
      scheduleRetry(new Error('Whiteboard connection closed'));
    };
    next.onerror = () => status('error', new Error('Whiteboard socket error'));
  }

  async function renew() {
    try {
      const session = await options.join();
      if (socket?.readyState === OPEN)
        socket.send(
          JSON.stringify({ type: 'authenticate', token: session.token })
        );
    } catch (error) {
      const code = (error as { status?: number }).status;
      if (code === 403 || code === 404 || code === 410) {
        stop();
        status('disconnected');
        options.onClosed();
      }
    }
  }

  function scheduleRetry(error: Error) {
    const delay = retry[attempts];
    if (delay === undefined) {
      status('error', error);
      return;
    }
    attempts++;
    retryTimer = setTimeout(() => void open(), delay);
  }

  function send(payload: unknown) {
    if (socket?.readyState !== OPEN) throw new Error('Whiteboard is offline');
    socket.send(JSON.stringify(payload));
  }

  return {
    connect(next) {
      handlers = next;
      attempts = 0;
      void open();
      return () => {
        stop();
        handlers = null;
      };
    },
    sendElementChanges: async (batch) =>
      send({
        type: 'elements',
        changes: batch.changes,
        timestamp: batch.timestamp,
      }),
    sendCursor: async (update) =>
      send({ type: 'cursor', x: update.x, y: update.y, tool: update.tool }),
    sendSelection: async (update) =>
      send({
        type: 'selection',
        selectedElementIds: Object.fromEntries(
          Object.entries(update.selectedElementIds ?? {}).map(([k, v]) => [
            k,
            !!v,
          ])
        ),
      }),
    subscribePresence(listener) {
      const wrapped = (members: BoardMember[]) => listener(members);
      listeners.add(wrapped);
      return () => listeners.delete(wrapped);
    },
  };
}
