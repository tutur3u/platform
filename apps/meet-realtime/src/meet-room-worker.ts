import { serializeJsonHeader } from '../../../packages/realtime/src/core/json-header';
import { verifyMeetRealtimeToken } from '../../../packages/realtime/src/meet/token';
import type { MeetRoomEnv } from './room-env';

export async function meetRoomRequest(
  request: Request,
  url: URL,
  env: Pick<MeetRoomEnv, 'MEET_ROOM' | 'MEET_REALTIME_TOKEN_SECRET'>
): Promise<Response> {
  const roomStateRequest =
    (url.pathname === '/room-state' &&
      ['GET', 'PATCH'].includes(request.method)) ||
    (['/room-device', '/room-service'].includes(url.pathname) &&
      request.method === 'POST');
  if (url.pathname !== '/realtime' && !roomStateRequest) {
    return new Response('Not found', { status: 404 });
  }

  if (!roomStateRequest && request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const token = verifyMeetRealtimeToken(
    roomStateRequest
      ? (request.headers
          .get('Authorization')
          ?.match(/^Bearer\s+(\S+)\s*$/i)?.[1] ?? '')
      : (url.searchParams.get('token') ?? ''),
    env.MEET_REALTIME_TOKEN_SECRET
  );
  if (!token) return new Response('Unauthorized', { status: 401 });

  // The signed room id owns routing for the verified ticket.
  const room = env.MEET_ROOM.get(env.MEET_ROOM.idFromName(token.roomId));
  const headers = new Headers(request.headers);
  headers.set('x-meet-token', serializeJsonHeader(token));
  return room.fetch(new Request(request, { headers }));
}
