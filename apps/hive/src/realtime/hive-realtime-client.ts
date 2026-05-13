import type {
  HiveWorldData,
  HiveWorldEvent,
} from '@tuturuuu/internal-api/hive';

export type HiveRealtimeStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error';

export type HiveRealtimeMessage =
  | {
      event: HiveWorldEvent;
      type: 'world.event';
      world?: HiveWorldData;
    }
  | {
      serverId: string;
      type: 'presence';
      users: Array<{ id: string; lastSeenAt: string }>;
    }
  | {
      selection: { id: string; kind: string } | null;
      type: 'selection';
      userId: string;
    };

export type HiveRealtimeClient = {
  close: () => void;
  send: (message: Record<string, unknown>) => boolean;
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

  const socket = new WebSocket(endpoint);
  const queue: Record<string, unknown>[] = [];

  args.onStatus?.('connecting');

  socket.addEventListener('open', () => {
    args.onStatus?.('connected');
    while (queue.length > 0 && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(queue.shift()));
    }
  });
  socket.addEventListener('close', () => args.onStatus?.('disconnected'));
  socket.addEventListener('error', () => args.onStatus?.('error'));
  socket.addEventListener('message', (event) => {
    try {
      args.onMessage(JSON.parse(event.data) as HiveRealtimeMessage);
    } catch {
      // Ignore malformed peer messages; the realtime service validates inputs.
    }
  });

  return {
    close: () => socket.close(),
    send: (message) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        return true;
      }
      if (socket.readyState === WebSocket.CONNECTING) {
        queue.push(message);
        return true;
      }
      return false;
    },
  };
}
