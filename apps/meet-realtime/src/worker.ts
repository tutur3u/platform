import { verifyMeetRealtimeToken } from '../../../packages/realtime/src/meet/token';
import type { MeetRoomEnv } from './room-do';

export { MeetRoomDurableObject } from './room-do';

/**
 * Cloudflare Worker entry for Tuturuuu Meet realtime.
 *
 * The Worker only authenticates the join token and routes the upgrade to the
 * room's Durable Object; all room state and every Cloudflare Realtime SFU call
 * happens inside the object so a room has exactly one authority.
 */
export default {
  async fetch(request: Request, env: MeetRoomEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ ok: true });
    }

    if (url.pathname !== '/realtime') {
      return new Response('Not found', { status: 404 });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const token = verifyMeetRealtimeToken(
      url.searchParams.get('token') ?? '',
      env.MEET_REALTIME_TOKEN_SECRET
    );

    if (!token) {
      return new Response('Unauthorized', { status: 401 });
    }

    // The room id is derived from the signed token, never from the query
    // string, so a client cannot address a room it was not issued a token for.
    const id = env.MEET_ROOM.idFromName(token.roomId);
    const room = env.MEET_ROOM.get(id);

    const headers = new Headers(request.headers);
    headers.set('x-meet-token', JSON.stringify(token));

    return room.fetch(
      new Request(request.url, { headers, method: request.method })
    );
  },
};
