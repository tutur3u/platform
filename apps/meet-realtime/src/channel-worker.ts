import { channelTicketSchema } from '../../../packages/realtime/src/channels/schema';
import { verifyRealtimePayload } from '../../../packages/realtime/src/core/token';
import { verifyEraseCommand } from '../../../packages/realtime/src/documents/erase';
import type { ChannelRoomEnv } from './channel-room-do';
export async function channelRequest(request: Request, env: ChannelRoomEnv) {
  const url = new URL(request.url);
  if (url.pathname === '/channels/erase') {
    if (env.MEET_ERASE_DO_PROTOCOL !== 'true')
      return new Response(null, { status: 404 });
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const command = await verifyEraseCommand(
      request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1] ?? '',
      env.MEET_ERASE_DO_PUBLIC_KEYS
    );
    if (!command) return new Response(null, { status: 401 });
    return env.CHANNEL_ROOM.get(
      env.CHANNEL_ROOM.idFromName(command.topic)
    ).fetch(request);
  }
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
