import { verifyRealtimePayload } from '../../../packages/realtime/src/core/token';
import { boardTicketSchema } from '../../../packages/realtime/src/meet/board-sync-schema';
import type { WhiteboardRoomEnv } from './whiteboard-room-do';

/** Verifies the join ticket, then hands the upgrade to the board's room. */
export async function whiteboardRequest(
  request: Request,
  env: WhiteboardRoomEnv
) {
  if (!env.WHITEBOARD_ROOM)
    return new Response('Whiteboard unavailable', { status: 503 });
  const token = new URL(request.url).searchParams.get('token');
  const parsed = boardTicketSchema.safeParse(
    verifyRealtimePayload(token ?? '', env.MEET_REALTIME_TOKEN_SECRET)
  );
  if (!parsed.success || parsed.data.exp * 1000 <= Date.now())
    return new Response(null, { status: 401 });
  if (parsed.data.kind !== 'join') return new Response(null, { status: 403 });
  const headers = new Headers(request.headers);
  headers.set('x-board-ticket', JSON.stringify(parsed.data));
  return env.WHITEBOARD_ROOM.get(
    env.WHITEBOARD_ROOM.idFromName(
      `${parsed.data.meetingId}:${parsed.data.boardId}`
    )
  ).fetch(new Request(request, { headers }));
}
