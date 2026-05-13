import type {
  HiveWorldData,
  HiveWorldEvent,
} from '@tuturuuu/internal-api/hive';
import type {
  HiveRealtimeAwareness,
  HiveRealtimeServerMessage,
} from '@tuturuuu/realtime/hive';

export type HiveRealtimeStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error';

export type HiveRealtimeMessage =
  | HiveRealtimeServerMessage
  | {
      event: HiveWorldEvent;
      type: 'world.event';
      world?: HiveWorldData;
    }
  | {
      selection: { id: string; kind: string } | null;
      type: 'selection';
      userId: string;
    };

export type HiveRealtimeClient = {
  close: () => void;
  send: (message: Record<string, unknown>) => boolean;
  sendAwareness: (awareness: HiveRealtimeAwareness) => boolean;
};

export function connectHiveRealtime(args: {
  onMessage: (message: HiveRealtimeMessage) => void;
  onStatus?: (status: HiveRealtimeStatus) => void;
  token: string;
  url: string;
}): HiveRealtimeClient {
  const endpoint = new URL(args.url, window.location.origin);
  const shouldUseSecureSocket =
    window.location.protocol === 'https:' ||
    endpoint.protocol === 'https:' ||
    endpoint.protocol === 'wss:';
  endpoint.protocol = shouldUseSecureSocket ? 'wss:' : 'ws:';
  endpoint.searchParams.set('token', args.token);

  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let reconnectAttempts = 0;
  let socket: WebSocket | null = null;
  const queue: Record<string, unknown>[] = [];

  const open = () => {
    args.onStatus?.('connecting');
    socket = new WebSocket(endpoint);

    socket.addEventListener('open', () => {
      reconnectAttempts = 0;
      args.onStatus?.('connected');
      socket?.send(JSON.stringify({ type: 'sync.hello' }));
      while (queue.length > 0 && socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(queue.shift()));
      }
    });

    socket.addEventListener('close', () => {
      args.onStatus?.('disconnected');
      if (closed) return;
      reconnectAttempts += 1;
      const delay = Math.min(20_000, 500 * 2 ** reconnectAttempts);
      retryTimer = setTimeout(open, delay);
    });

    socket.addEventListener('error', () => args.onStatus?.('error'));
    socket.addEventListener('message', (event) => {
      try {
        args.onMessage(JSON.parse(event.data) as HiveRealtimeMessage);
      } catch {
        // Ignore malformed peer messages; the realtime service validates inputs.
      }
    });
  };

  open();

  const send = (message: Record<string, unknown>) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return true;
    }
    if (socket?.readyState === WebSocket.CONNECTING) {
      queue.push(message);
      return true;
    }
    return false;
  };

  return {
    close: () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    },
    send,
    sendAwareness: (awareness) => send({ awareness, type: 'awareness.update' }),
  };
}
