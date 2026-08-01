import type { ServerWebSocket } from 'bun';
import {
  canMeetRealtimeManageParticipants,
  createMeetRoomSnapshot,
  type MeetRealtimeServerMessage,
  type MeetRealtimeTokenPayload,
  type MeetRoomSnapshot,
} from '../../../packages/realtime/src/meet';

export type MeetWebSocket = ServerWebSocket<{
  token: MeetRealtimeTokenPayload;
}>;

type RoomState = {
  clients: Set<MeetWebSocket>;
  snapshot: MeetRoomSnapshot;
};

export const rooms = new Map<string, RoomState>();

export function getRoom(roomId: string): RoomState {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  const created: RoomState = {
    clients: new Set<MeetWebSocket>(),
    snapshot: createMeetRoomSnapshot(),
  };
  rooms.set(roomId, created);
  return created;
}

export function send(ws: MeetWebSocket, message: MeetRealtimeServerMessage) {
  ws.send(JSON.stringify(message));
}

function eachClient(
  roomId: string,
  visit: (client: MeetWebSocket) => void,
  except?: MeetWebSocket
) {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const client of room.clients) {
    if (client === except || client.readyState !== 1) continue;
    visit(client);
  }
}

export function broadcast(
  roomId: string,
  messages: MeetRealtimeServerMessage[],
  except?: MeetWebSocket
) {
  if (!messages.length) return;
  eachClient(
    roomId,
    (client) => {
      for (const message of messages) send(client, message);
    },
    except
  );
}

export function sendToUser(
  roomId: string,
  userId: string,
  messages: MeetRealtimeServerMessage[]
) {
  if (!messages.length) return;
  eachClient(roomId, (client) => {
    if (client.data.token.userId !== userId) return;
    for (const message of messages) send(client, message);
  });
}

export function sendToManagers(
  roomId: string,
  messages: MeetRealtimeServerMessage[]
) {
  if (!messages.length) return;
  eachClient(roomId, (client) => {
    if (!canMeetRealtimeManageParticipants(client.data.token)) return;
    for (const message of messages) send(client, message);
  });
}

export function disconnectUsers(roomId: string, userIds: string[]) {
  if (!userIds.length) return;
  const targets = new Set(userIds);
  eachClient(roomId, (client) => {
    if (targets.has(client.data.token.userId)) {
      client.close(4403, 'removed_from_room');
    }
  });
}

/** True when the participant still holds another socket in the room. */
export function hasOtherSocket(
  roomId: string,
  userId: string,
  except: MeetWebSocket
) {
  const room = rooms.get(roomId);
  if (!room) return false;

  for (const client of room.clients) {
    if (client !== except && client.data.token.userId === userId) return true;
  }
  return false;
}
