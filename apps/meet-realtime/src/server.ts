import {
  admitOrHold,
  applyMeetRoomCommand,
  type MeetRealtimeTokenPayload,
  type MeetRoomOutcome,
  type MeetSfuIntent,
  meetPresenceMessage,
  meetRealtimeClientMessageSchema,
  pruneMeetPresence,
  releaseParticipant,
  remoteMeetTracks,
} from '../../../packages/realtime/src/meet';
import { CloudflareSfuClient } from './cloudflare-sfu';
import {
  broadcast,
  disconnectUsers,
  getRoom,
  hasOtherSocket,
  type MeetWebSocket,
  rooms,
  send,
  sendToManagers,
  sendToUser,
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

const PRESENCE_SWEEP_MS = 10_000;

function runSfuIntent(intent: MeetSfuIntent, client: SfuClient) {
  const { message } = intent;

  if (message.type === 'sfu.session.create') {
    return client.createSession(message.sessionDescription);
  }
  if (
    message.type === 'sfu.tracks.publish' ||
    message.type === 'sfu.tracks.subscribe'
  ) {
    return client.addTracks(message);
  }
  if (message.type === 'sfu.renegotiate') {
    return client.renegotiate(message);
  }
  return client.closeTracks(message);
}

async function flush(
  ws: MeetWebSocket,
  outcome: MeetRoomOutcome,
  getSfuClient: () => SfuClient
) {
  const { roomId } = ws.data.token;
  const room = getRoom(roomId);
  room.snapshot = outcome.state;

  for (const message of outcome.reply) send(ws, message);
  broadcast(roomId, outcome.broadcast);
  sendToManagers(roomId, outcome.toManagers);
  for (const entry of outcome.direct) {
    sendToUser(roomId, entry.userId, [entry.message]);
  }

  if (outcome.sfu) {
    try {
      const result = await runSfuIntent(outcome.sfu, getSfuClient());
      send(ws, {
        action: outcome.sfu.message.type,
        requestId: outcome.sfu.requestId,
        result,
        type: 'sfu.response',
      });
    } catch (error) {
      send(ws, {
        error: error instanceof Error ? error.message : 'sfu_request_failed',
        requestId: outcome.sfu.requestId,
        type: 'error',
      });
    }
  }

  disconnectUsers(roomId, outcome.disconnect);
}

async function handleMessage(
  ws: MeetWebSocket,
  raw: string,
  getSfuClient: () => SfuClient
) {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    send(ws, { error: 'malformed_json', type: 'error' });
    return;
  }

  const parsed = meetRealtimeClientMessageSchema.safeParse(json);
  if (!parsed.success) {
    send(ws, { error: 'malformed_event', type: 'error' });
    return;
  }

  const room = getRoom(ws.data.token.roomId);
  await flush(
    ws,
    applyMeetRoomCommand(room.snapshot, {
      message: parsed.data,
      now: new Date().toISOString(),
      token: ws.data.token,
    }),
    getSfuClient
  );
}

export function createMeetRealtimeServer(
  options: MeetRealtimeServerOptions = {}
) {
  let sfuClient = options.sfuClient;
  const getSfuClient = () => {
    sfuClient ??= new CloudflareSfuClient();
    return sfuClient;
  };

  setInterval(() => {
    for (const [roomId, room] of rooms.entries()) {
      room.snapshot = pruneMeetPresence(room.snapshot, Date.now());
      broadcast(roomId, [meetPresenceMessage(room.snapshot, roomId)]);
    }
  }, PRESENCE_SWEEP_MS);

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

      const upgraded = server.upgrade(request, { data: { token } });

      return upgraded
        ? undefined
        : new Response('Expected WebSocket upgrade', { status: 426 });
    },
    port: options.port ?? Number(process.env.PORT ?? 7816),
    websocket: {
      close(ws) {
        const { roomId, userId } = ws.data.token;
        const room = rooms.get(roomId);
        room?.clients.delete(ws);
        if (!room || hasOtherSocket(roomId, userId, ws)) return;

        const outcome = releaseParticipant(room.snapshot, userId, roomId);
        room.snapshot = outcome.state;
        broadcast(roomId, outcome.broadcast);
        sendToManagers(roomId, outcome.toManagers);
      },
      message(ws, message) {
        handleMessage(ws, String(message), getSfuClient).catch((error) => {
          send(ws, {
            error: error instanceof Error ? error.message : 'unknown_error',
            type: 'error',
          });
        });
      },
      open(ws) {
        const { token } = ws.data;
        const room = getRoom(token.roomId);
        room.clients.add(ws);

        const outcome = admitOrHold(
          room.snapshot,
          token,
          new Date().toISOString()
        );
        room.snapshot = outcome.state;

        for (const message of outcome.reply) send(ws, message);
        broadcast(token.roomId, outcome.broadcast);
        sendToManagers(token.roomId, outcome.toManagers);

        if (room.snapshot.waiting[token.userId]) return;

        send(ws, meetPresenceMessage(room.snapshot, token.roomId));
        for (const track of remoteMeetTracks(room.snapshot, token.userId)) {
          send(ws, {
            sessionId: track.sessionId,
            tracks: [track],
            type: 'track.published',
            userId: track.userId,
          });
        }
      },
    },
  });
}
