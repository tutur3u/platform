import { channelTicketSchema } from '../../../packages/realtime/src/channels/schema';
import { verifyRealtimePayload } from '../../../packages/realtime/src/core/token';
import type { ChannelRoomEnv } from './channel-room-do';
export async function channelRequest(request: Request, env: ChannelRoomEnv) {
  const url = new URL(request.url);
  const join = url.pathname === '/channels';
  const raw = join
    ? url.searchParams.get('token')
    : request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  const ticket = channelTicketSchema.safeParse(
    verifyRealtimePayload(raw ?? '', env.MEET_REALTIME_TOKEN_SECRET)
  );
  if (!ticket.success || ticket.data.exp * 1000 <= Date.now())
    return new Response(null, { status: 401 });
  if (
    ticket.data.kind !==
    (join
      ? 'join'
      : url.pathname === '/channels/document'
        ? 'document'
        : 'publish')
  )
    return new Response(null, { status: 403 });
  const headers = new Headers(request.headers);
  headers.set('x-channel-ticket', JSON.stringify(ticket.data));
  return env.CHANNEL_ROOM.get(
    env.CHANNEL_ROOM.idFromName(ticket.data.topic)
  ).fetch(new Request(request, { headers }));
}
