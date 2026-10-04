import { collaborationTicketSchema } from '../../../packages/realtime/src/collaboration';
import { verifyRealtimePayload } from '../../../packages/realtime/src/core/token';
import type { CollaborationRoomEnv } from './collaboration-room-do';
export async function collaborationRequest(
  request: Request,
  env: CollaborationRoomEnv
) {
  const url = new URL(request.url);
  const isJoin = url.pathname === '/collaboration';
  if (!env.COLLABORATION_ROOM)
    return new Response('Collaboration unavailable', { status: 503 });
  const raw = isJoin
    ? url.searchParams.get('token')
    : request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  const parsed = collaborationTicketSchema.safeParse(
    verifyRealtimePayload(raw ?? '', env.MEET_REALTIME_TOKEN_SECRET)
  );
  if (!parsed.success || parsed.data.exp * 1000 <= Date.now())
    return new Response(null, { status: 401 });
  const expected = isJoin
    ? 'join'
    : url.pathname.endsWith('/seed')
      ? 'seed'
      : url.pathname.endsWith('/runner-files')
        ? 'runner-files'
        : 'checkpoint';
  if (parsed.data.kind !== expected) return new Response(null, { status: 403 });
  const headers = new Headers(request.headers);
  headers.set('x-collaboration-ticket', JSON.stringify(parsed.data));
  return env.COLLABORATION_ROOM.get(
    env.COLLABORATION_ROOM.idFromName(parsed.data.roomId)
  ).fetch(new Request(request, { headers }));
}
