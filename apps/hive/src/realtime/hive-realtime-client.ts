import type { HiveWorldEvent } from '@tuturuuu/internal-api';

export type HiveRealtimeMessage =
  | {
      event: HiveWorldEvent;
      type: 'world.event';
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
  send: (message: Record<string, unknown>) => void;
};

export function connectHiveRealtime(args: {
  onMessage: (message: HiveRealtimeMessage) => void;
  token: string;
  url: string;
}): HiveRealtimeClient {
  const endpoint = new URL(args.url, window.location.origin);
  endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
  endpoint.searchParams.set('token', args.token);

  const socket = new WebSocket(endpoint);
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
      }
    },
  };
}
