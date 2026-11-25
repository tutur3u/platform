import { verifyRealtimePayload } from '../../../packages/realtime/src/core/token';
import {
  BOARD_SOCKET_PROTOCOL,
  BOARD_TOKEN_PROTOCOL_PREFIX,
  type BoardTicket,
  boardTicketSchema,
} from '../../../packages/realtime/src/meet/board-sync-schema';
import type { WhiteboardRoomEnv } from './whiteboard-room-do';

export function serializeBoardTicketHeader(ticket: BoardTicket) {
  // Escape UTF-16 code units so the header carries only ASCII bytes.
  return JSON.stringify(ticket).replace(
    /[^\x20-\x7e]/g,
    (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

/** Verifies the join ticket, then hands the upgrade to the board's room. */
export async function whiteboardRequest(
  request: Request,
  env: WhiteboardRoomEnv
) {
  if (!env.WHITEBOARD_ROOM)
    return new Response('Whiteboard unavailable', { status: 503 });
  // The ticket rides in the offered subprotocols, never in the URL.
  const offered = (request.headers.get('Sec-WebSocket-Protocol') ?? '')
    .split(',')
    .map((protocol) => protocol.trim());
  if (!offered.includes(BOARD_SOCKET_PROTOCOL))
    return new Response(null, { status: 400 });
  const token = offered
    .find((protocol) => protocol.startsWith(BOARD_TOKEN_PROTOCOL_PREFIX))
    ?.slice(BOARD_TOKEN_PROTOCOL_PREFIX.length);
  const parsed = boardTicketSchema.safeParse(
    verifyRealtimePayload(token ?? '', env.MEET_REALTIME_TOKEN_SECRET)
  );
  if (!parsed.success || parsed.data.exp * 1000 <= Date.now())
    return new Response(null, { status: 401 });
  if (parsed.data.kind !== 'join') return new Response(null, { status: 403 });
  const headers = new Headers(request.headers);
  headers.set('x-board-ticket', serializeBoardTicketHeader(parsed.data));
  return env.WHITEBOARD_ROOM.get(
    env.WHITEBOARD_ROOM.idFromName(
      `${parsed.data.meetingId}:${parsed.data.boardId}`
    )
  ).fetch(new Request(request, { headers }));
}
