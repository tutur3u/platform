import {
  canMeetRealtimePublish,
  canMeetRealtimeUpdateStage,
  type MeetRealtimeClientMessage,
  type MeetRealtimeTokenPayload,
  meetRealtimeClientMessageSchema,
} from '../../../packages/realtime/src/meet';
import { CloudflareSfuClient } from './cloudflare-sfu';
import {
  broadcast,
  createPresence,
  getRoom,
  type MeetWebSocket,
  presencePayload,
  publishPresence,
  type RoomTrack,
  rooms,
  send,
} from './room-state';
import { verifyMeetRealtimeJoinToken } from './token';

type SfuClient = Pick<
  CloudflareSfuClient,
  'addTracks' | 'closeTracks' | 'createSession' | 'renegotiate'
>;

export type MeetRealtimeServerOptions = {
  port?: number;
  sfuClient?: SfuClient;
};

function assertScope(
  ws: MeetWebSocket,
  scope: string,
  requestId?: string
): boolean {
  if (ws.data.token.role === 'host' || ws.data.token.scopes.includes(scope)) {
    return true;
  }

  send(ws, { error: 'permission_denied', requestId, type: 'error' });
  return false;
}

function trackKey(sessionId: string, track: RoomTrack) {
  return `${sessionId}:${track.trackName || track.mid || crypto.randomUUID()}`;
}

async function handleSfuMessage(
  ws: MeetWebSocket,
  message: Extract<MeetRealtimeClientMessage, { type: `sfu.${string}` }>,
  sfuClient: SfuClient
) {
  if (message.type === 'sfu.session.create') {
    if (!assertScope(ws, 'sfu:join', message.requestId)) {
      return;
    }

    const result = await sfuClient.createSession(message.sessionDescription);
    send(ws, {
      action: message.type,
      requestId: message.requestId,
      result,
      type: 'sfu.response',
    });
    return;
  }

  if (
    message.type === 'sfu.tracks.publish' &&
    !message.tracks.every((track) =>
      canMeetRealtimePublish(ws.data.token, track.kind ?? 'video')
    )
  ) {
    send(ws, {
      error: 'publish_not_allowed',
      requestId: message.requestId,
      type: 'error',
    });
    return;
  }

  if (
    message.type === 'sfu.tracks.subscribe' &&
    !assertScope(ws, 'sfu:subscribe', message.requestId)
  ) {
    return;
  }

  if (
    message.type === 'sfu.renegotiate' &&
    !assertScope(ws, 'sfu:join', message.requestId)
  ) {
    return;
  }

  if (
    message.type === 'sfu.tracks.close' &&
    !assertScope(ws, 'sfu:publish', message.requestId)
  ) {
    return;
  }

  if (message.type === 'sfu.tracks.publish') {
    const result = await sfuClient.addTracks(message);
    const room = getRoom(ws.data.token.roomId);
    const tracks = message.tracks.map((track) => ({
      ...track,
      sessionId: message.sessionId,
      userId: ws.data.token.userId,
    }));
    for (const track of tracks) {
      room.tracks.set(trackKey(message.sessionId, track), track);
    }

    broadcast(ws.data.token.roomId, {
      requestId: message.requestId,
      sessionId: message.sessionId,
      tracks,
      type: 'track.published',
      userId: ws.data.token.userId,
    });
    send(ws, {
      action: message.type,
      requestId: message.requestId,
      result,
      type: 'sfu.response',
    });
    return;
  }

  if (message.type === 'sfu.tracks.subscribe') {
    const result = await sfuClient.addTracks(message);
    send(ws, {
      action: message.type,
      requestId: message.requestId,
      result,
      type: 'sfu.response',
    });
    return;
  }

  if (message.type === 'sfu.renegotiate') {
    const result = await sfuClient.renegotiate(message);
    send(ws, {
      action: message.type,
      requestId: message.requestId,
      result,
      type: 'sfu.response',
    });
    return;
  }

  const result = await sfuClient.closeTracks(message);
  broadcast(ws.data.token.roomId, {
    requestId: message.requestId,
    sessionId: message.sessionId,
    tracks: message.tracks,
    type: 'track.closed',
    userId: ws.data.token.userId,
  });
  send(ws, {
    action: message.type,
    requestId: message.requestId,
    result,
    type: 'sfu.response',
  });
}

async function handleMessage(
  ws: MeetWebSocket,
  raw: string,
  sfuClient: SfuClient
) {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    send(ws, { error: 'malformed_json', type: 'error' });
    return;
  }

  const parsed = meetRealtimeClientMessageSchema.safeParse(parsedJson);
  if (!parsed.success) {
    send(ws, { error: 'malformed_event', type: 'error' });
    return;
  }

  const { token } = ws.data;
  const room = getRoom(token.roomId);
  const message = parsed.data;

  if (message.type === 'presence.join') {
    room.presence.set(
      token.userId,
      createPresence(
        {
          ...token,
          displayName: message.displayName || token.displayName,
        },
        message.media
      )
    );
    publishPresence(token.roomId);
    return;
  }

  if (message.type === 'presence.update') {
    const existing = room.presence.get(token.userId) ?? createPresence(token);
    room.presence.set(token.userId, {
      ...existing,
      lastSeenAt: new Date().toISOString(),
      media: message.media,
    });
    publishPresence(token.roomId);
    return;
  }

  if (message.type === 'chat.message') {
    if (!assertScope(ws, 'chat:write', message.requestId)) {
      return;
    }

    broadcast(token.roomId, {
      body: message.body,
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      requestId: message.requestId,
      type: 'chat.message',
      userId: token.userId,
    });
    return;
  }

  if (message.type === 'stage.update') {
    if (!canMeetRealtimeUpdateStage(token)) {
      send(ws, {
        error: 'stage_update_not_allowed',
        requestId: message.requestId,
        type: 'error',
      });
      return;
    }

    room.stage = message.stage;
    broadcast(token.roomId, {
      requestId: message.requestId,
      stage: room.stage,
      type: 'stage',
    });
    return;
  }

  if (message.type === 'stream.state') {
    if (!assertScope(ws, 'stream:control', message.requestId)) {
      return;
    }

    room.streamState = message.state;
    broadcast(token.roomId, {
      requestId: message.requestId,
      state: message.state,
      type: 'stream.state',
    });
    return;
  }

  await handleSfuMessage(ws, message, sfuClient);
}

export function createMeetRealtimeServer(
  options: MeetRealtimeServerOptions = {}
) {
  const sfuClient = options.sfuClient ?? new CloudflareSfuClient();

  setInterval(() => {
    for (const roomId of rooms.keys()) {
      publishPresence(roomId);
    }
  }, 10_000);

  return Bun.serve<{ token: MeetRealtimeTokenPayload }>({
    fetch(request, server) {
      const url = new URL(request.url);

      if (url.pathname === '/health') {
        return Response.json({ ok: true });
      }

      if (url.pathname !== '/realtime') {
        return new Response('Not found', { status: 404 });
      }

      const token = verifyMeetRealtimeJoinToken(
        url.searchParams.get('token') ?? ''
      );
      if (!token) {
        return new Response('Unauthorized', { status: 401 });
      }

      const upgraded = server.upgrade(request, {
        data: { token },
      });

      return upgraded
        ? undefined
        : new Response('Expected WebSocket upgrade', { status: 426 });
    },
    port: options.port ?? Number(process.env.PORT ?? 7816),
    websocket: {
      close(ws) {
        const room = rooms.get(ws.data.token.roomId);
        room?.clients.delete(ws);
        room?.presence.delete(ws.data.token.userId);
        publishPresence(ws.data.token.roomId);
      },
      message(ws, message) {
        handleMessage(ws, String(message), sfuClient).catch((error) => {
          send(ws, {
            error: error instanceof Error ? error.message : 'unknown_error',
            type: 'error',
          });
        });
      },
      open(ws) {
        const room = getRoom(ws.data.token.roomId);
        room.clients.add(ws);
        room.presence.set(ws.data.token.userId, createPresence(ws.data.token));
        send(ws, {
          expiresAt: new Date(ws.data.token.exp * 1000).toISOString(),
          limits: ws.data.token.limits,
          mode: ws.data.token.mode,
          role: ws.data.token.role,
          roomId: ws.data.token.roomId,
          stage: room.stage,
          type: 'ready',
          userId: ws.data.token.userId,
        });
        send(ws, presencePayload(ws.data.token.roomId));
        publishPresence(ws.data.token.roomId);
      },
    },
  });
}
