import type { ServerWebSocket } from 'bun';
import {
  type MeetRealtimePresence,
  type MeetRealtimeServerMessage,
  type MeetRealtimeStageState,
  type MeetRealtimeTokenPayload,
  meetRealtimeStageStateSchema,
} from '../../../packages/realtime/src/meet';

export type MeetWebSocket = ServerWebSocket<{
  token: MeetRealtimeTokenPayload;
}>;

export type RoomTrack = {
  kind?: string;
  mid?: string;
  sessionId: string;
  trackName?: string;
  userId: string;
};

type RoomState = {
  clients: Set<MeetWebSocket>;
  presence: Map<string, MeetRealtimePresence>;
  stage: MeetRealtimeStageState;
  streamState: Extract<
    MeetRealtimeServerMessage,
    { type: 'stream.state' }
  >['state'];
  tracks: Map<string, RoomTrack>;
};

const PRESENCE_TTL_MS = 30_000;

export const rooms = new Map<string, RoomState>();

export function getRoom(roomId: string) {
  const existing = rooms.get(roomId);
  if (existing) {
    return existing;
  }

  const created: RoomState = {
    clients: new Set<MeetWebSocket>(),
    presence: new Map<string, MeetRealtimePresence>(),
    stage: meetRealtimeStageStateSchema.parse({}),
    streamState: 'idle',
    tracks: new Map<string, RoomTrack>(),
  };
  rooms.set(roomId, created);
  return created;
}

export function send(ws: MeetWebSocket, message: MeetRealtimeServerMessage) {
  ws.send(JSON.stringify(message));
}

export function broadcast(
  roomId: string,
  message: MeetRealtimeServerMessage,
  except?: MeetWebSocket
) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  const payload = JSON.stringify(message);
  for (const client of room.clients) {
    if (client === except) {
      continue;
    }
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

function getDisplayName(token: MeetRealtimeTokenPayload) {
  return token.displayName || (token.role === 'host' ? 'Host' : 'Participant');
}

export function createPresence(
  token: MeetRealtimeTokenPayload,
  media?: MeetRealtimePresence['media']
) {
  const now = new Date().toISOString();
  return {
    displayName: getDisplayName(token),
    joinedAt: now,
    lastSeenAt: now,
    media: {
      audioEnabled: false,
      screenEnabled: false,
      videoEnabled: token.limits.video.defaultCameraEnabled,
      ...media,
    },
    role: token.role,
    userId: token.userId,
  } satisfies MeetRealtimePresence;
}

export function presencePayload(roomId: string): MeetRealtimeServerMessage {
  const room = getRoom(roomId);
  const now = Date.now();

  for (const [userId, presence] of room.presence.entries()) {
    if (Date.parse(presence.lastSeenAt) + PRESENCE_TTL_MS < now) {
      room.presence.delete(userId);
    }
  }

  return {
    presence: Array.from(room.presence.values()),
    roomId,
    type: 'presence',
  };
}

export function publishPresence(roomId: string) {
  broadcast(roomId, presencePayload(roomId));
}
