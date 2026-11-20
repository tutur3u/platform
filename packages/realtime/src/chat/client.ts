import type { ChatRealtimeEvent } from './index';

/**
 * Portable WebSocket client for the chat-realtime Worker. It owns ticketing,
 * replay cursors, jittered reconnects and the switch to polling, and leaves
 * caching and rendering to the adapter. It imports no framework or runtime
 * globals beyond an injectable WebSocket constructor and timers.
 */

export const CHAT_REALTIME_SUBPROTOCOL = 'tuturuuu.chat.v1';
export const CHAT_REALTIME_TICKET_PROTOCOL_PREFIX = 'ticket.';

/** Close codes the Worker rooms send; see apps/chat-realtime/src/protocol.ts. */
export const CHAT_REALTIME_CLOSE = {
  expired: 4001,
  removed: 4003,
  stopped: 4503,
} as const;

export const CHAT_REALTIME_RECONNECT = {
  maxFailures: 5,
  minDelayMs: 1_000,
  maxDelayMs: 30_000,
} as const;

export type ChatRealtimeTicketResponse =
  | { enabled: false }
  | { enabled: true; expiresAt: string; ticket: string; url: string };

export type ChatRealtimePresenceState = 'foreground' | 'background';

export type ChatRealtimeServerFrame =
  | {
      t: 'ready';
      expiresAt: number;
      room: 'inbox' | 'conversation';
      seq?: number;
      userId: string;
      present?: { state: ChatRealtimePresenceState; userId: string }[];
      online?: string[];
    }
  | { t: 'event'; seq?: number; event: ChatRealtimeEvent }
  | { t: 'typing'; on: boolean; userId: string }
  | {
      t: 'presence';
      state: ChatRealtimePresenceState | 'offline';
      userId: string;
    }
  | { t: 'online'; on: boolean; userId: string }
  | { t: 'resync' }
  | { t: 'expired' }
  | { t: 'stopped' };

export type ChatRealtimeClientFrame =
  | { t: 'typing'; on: boolean }
  | { t: 'presence'; state: ChatRealtimePresenceState };

/**
 * `connecting`: a ticket or socket is in flight. `open`: the room is live.
 * `polling`: reconnects exhausted; poll until `retry()`. `disabled`: the Web
 * API has no Worker configured. `removed`: the room revoked this user.
 * `closed`: the adapter closed the connection.
 */
export type ChatRealtimeConnectionStatus =
  | 'connecting'
  | 'open'
  | 'polling'
  | 'disabled'
  | 'removed'
  | 'closed';

export interface ChatRealtimeSocket {
  readonly readyState: number;
  close(code?: number, reason?: string): void;
  send(data: string): void;
  addEventListener(
    type: 'open' | 'message' | 'close' | 'error',
    listener: (event: { code?: number; data?: unknown }) => void
  ): void;
}

export interface ChatRealtimeConnectionOptions {
  getTicket: () => Promise<ChatRealtimeTicketResponse>;
  /** Frames other than ready/resync/expired/stopped, after cursor updates. */
  onFrame: (frame: ChatRealtimeServerFrame) => void;
  /** Refetch from the REST API: first connect, `resync`, or removal. */
  onResync: () => void;
  onReady?: (frame: Extract<ChatRealtimeServerFrame, { t: 'ready' }>) => void;
  onStatus?: (status: ChatRealtimeConnectionStatus) => void;
  createSocket?: (url: string, protocols: string[]) => ChatRealtimeSocket;
  random?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  maxFailures?: number;
}

export interface ChatRealtimeConnection {
  readonly status: ChatRealtimeConnectionStatus;
  /** Sends a client frame when the socket is open; false otherwise. */
  send(frame: ChatRealtimeClientFrame): boolean;
  /** Reconnects now from `polling` (foreground or network change). */
  retry(): void;
  close(): void;
}

/** Full-jitter delay in [delay / 2, delay], with delay doubling from 1 s to 30 s. */
export function chatRealtimeReconnectDelay(failures: number, random: number) {
  const exponent = Math.max(0, Math.min(failures - 1, 10));
  const ceiling = Math.min(
    CHAT_REALTIME_RECONNECT.maxDelayMs,
    CHAT_REALTIME_RECONNECT.minDelayMs * 2 ** exponent
  );
  const unit = Math.min(1, Math.max(0, random));
  return Math.round(ceiling / 2 + (ceiling / 2) * unit);
}

export function parseChatRealtimeServerFrame(
  data: unknown
): ChatRealtimeServerFrame | null {
  if (typeof data !== 'string') return null;
  try {
    const value = JSON.parse(data) as { t?: unknown } | null;
    return value && typeof value.t === 'string'
      ? (value as ChatRealtimeServerFrame)
      : null;
  } catch {
    return null;
  }
}

export function chatRealtimeConnectUrl(base: string, since: number | null) {
  const url = new URL(base);
  if (since !== null) url.searchParams.set('since', String(since));
  return url.href;
}

const SOCKET_OPEN = 1;

export function createChatRealtimeConnection(
  options: ChatRealtimeConnectionOptions
): ChatRealtimeConnection {
  const createSocket =
    options.createSocket ??
    ((url: string, protocols: string[]) =>
      new WebSocket(url, protocols) as unknown as ChatRealtimeSocket);
  const random = options.random ?? Math.random;
  const setTimer =
    options.setTimer ??
    ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));
  const clearTimer =
    options.clearTimer ??
    ((handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>));
  const maxFailures =
    options.maxFailures ?? CHAT_REALTIME_RECONNECT.maxFailures;

  let status: ChatRealtimeConnectionStatus = 'connecting';
  let socket: ChatRealtimeSocket | null = null;
  let timer: unknown = null;
  let failures = 0;
  let since: number | null = null;
  let roomSeq: number | null = null;
  // Each attempt gets a generation so late callbacks from a replaced socket
  // or ticket request cannot change the current connection.
  let generation = 0;

  const setStatus = (next: ChatRealtimeConnectionStatus) => {
    if (status === next) return;
    status = next;
    options.onStatus?.(next);
  };

  const terminal = () =>
    status === 'closed' || status === 'disabled' || status === 'removed';

  const clearPending = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const dropSocket = () => {
    const current = socket;
    socket = null;
    if (current && current.readyState <= SOCKET_OPEN) {
      try {
        current.close(1000);
      } catch {
        // The socket is already closing; nothing else to release.
      }
    }
  };

  const fail = () => {
    dropSocket();
    if (terminal()) return;
    failures += 1;
    if (failures >= maxFailures) {
      setStatus('polling');
      return;
    }
    setStatus('connecting');
    clearPending();
    timer = setTimer(
      () => {
        timer = null;
        void connect();
      },
      chatRealtimeReconnectDelay(failures, random())
    );
  };

  const handleFrame = (attempt: number, frame: ChatRealtimeServerFrame) => {
    if (attempt !== generation) return;
    switch (frame.t) {
      case 'ready': {
        const firstOpen = since === null;
        failures = 0;
        roomSeq = typeof frame.seq === 'number' ? frame.seq : null;
        // A room sequence behind the cursor means the room lost its log;
        // the resync that follows restarts the cursor from the room.
        if (roomSeq !== null && (since === null || roomSeq < since))
          since = roomSeq;
        setStatus('open');
        options.onReady?.(frame);
        if (firstOpen) options.onResync();
        return;
      }
      case 'resync':
        if (roomSeq !== null) since = roomSeq;
        options.onResync();
        return;
      case 'event':
        if (typeof frame.seq === 'number')
          since = Math.max(since ?? 0, frame.seq);
        options.onFrame(frame);
        return;
      case 'expired':
      case 'stopped':
        // The close that follows decides between a fresh ticket and backoff.
        return;
      default:
        options.onFrame(frame);
    }
  };

  const handleClose = (attempt: number, code: number | undefined) => {
    if (attempt !== generation || terminal()) return;
    socket = null;
    if (code === CHAT_REALTIME_CLOSE.removed) {
      setStatus('removed');
      options.onResync();
      return;
    }
    if (code === CHAT_REALTIME_CLOSE.expired && status === 'open') {
      // An expired ticket on a live socket is routine: reconnect with a
      // fresh ticket and the replay cursor instead of backing off.
      setStatus('connecting');
      void connect();
      return;
    }
    fail();
  };

  async function connect() {
    if (terminal()) return;
    clearPending();
    dropSocket();
    const attempt = ++generation;
    setStatus('connecting');

    let ticket: ChatRealtimeTicketResponse;
    try {
      ticket = await options.getTicket();
    } catch {
      if (attempt === generation) fail();
      return;
    }
    if (attempt !== generation || terminal()) return;
    if (!ticket.enabled) {
      setStatus('disabled');
      return;
    }

    let next: ChatRealtimeSocket;
    try {
      next = createSocket(chatRealtimeConnectUrl(ticket.url, since), [
        CHAT_REALTIME_SUBPROTOCOL,
        `${CHAT_REALTIME_TICKET_PROTOCOL_PREFIX}${ticket.ticket}`,
      ]);
    } catch {
      fail();
      return;
    }
    socket = next;
    next.addEventListener('message', (event) => {
      const frame = parseChatRealtimeServerFrame(event.data);
      if (frame) handleFrame(attempt, frame);
    });
    next.addEventListener('close', (event) => handleClose(attempt, event.code));
    // Browsers follow every failed handshake with a close event, so errors
    // are settled there.
  }

  void connect();

  return {
    get status() {
      return status;
    },
    send(frame) {
      if (status !== 'open' || socket?.readyState !== SOCKET_OPEN) return false;
      socket.send(JSON.stringify(frame));
      return true;
    },
    retry() {
      if (status !== 'polling') return;
      // One attempt per foreground or network change; a failure returns to
      // polling instead of starting another backoff series.
      failures = maxFailures - 1;
      void connect();
    },
    close() {
      generation += 1;
      clearPending();
      setStatus('closed');
      dropSocket();
    },
  };
}
