import { edufestHall } from '@tuturuuu/worlds/edufest-hall';
import { resolveWorldsSession } from '../session/session.ts';
import { issueRoomAdmission, roomName } from './admission.ts';
import { ROOM_SOCKET_PATH } from './room-protocol.ts';
import { EDUFEST_HALL_REVISION } from './room.ts';

export { ROOM_SOCKET_PATH };
export const MAX_SHARD_ATTEMPTS = 4;

type ObjectId = { toString(): string };
export type WorldsRoomEnv = {
  WORLDS_VIEWER_ORIGIN?: string;
  TUTURUUU_APP_COORDINATION_SECRET?: string;
  WORLDS_ROOM_ADMISSION_SECRET?: string;
  WORLDS_ROOMS?: {
    idFromName(name: string): ObjectId;
    get(id: ObjectId): { fetch(request: Request): Promise<Response> };
  };
};

function reject(status: number) {
  return new Response(null, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function handleRoomUpgrade(
  request: Request,
  env: WorldsRoomEnv,
  clock = Date.now
) {
  const url = new URL(request.url);
  if (url.pathname !== ROOM_SOCKET_PATH) return reject(404);
  if (
    request.method !== 'GET' ||
    request.headers.get('upgrade')?.toLowerCase() !== 'websocket'
  )
    return reject(426);
  if (
    url.origin !== env.WORLDS_VIEWER_ORIGIN ||
    request.headers.get('origin') !== url.origin
  )
    return reject(403);
  if (url.search) return reject(400);

  const {
    TUTURUUU_APP_COORDINATION_SECRET: sessionSecret,
    WORLDS_ROOM_ADMISSION_SECRET: roomSecret,
    WORLDS_ROOMS: rooms,
  } = env;
  if (!sessionSecret?.trim() || !roomSecret?.trim() || !rooms)
    return reject(503);

  // The bundled hall admits authenticated Worlds accounts to its fixed revision.
  const actor = resolveWorldsSession(request, sessionSecret, clock());
  if (!actor) return reject(401);

  try {
    for (let shard = 0; shard < MAX_SHARD_ATTEMPTS; shard++) {
      const scope = {
        worldId: edufestHall.id,
        revision: EDUFEST_HALL_REVISION,
        shard,
      };
      const grant = await issueRoomAdmission(
        scope,
        async () => actor,
        roomSecret,
        clock
      );
      if (!grant) return reject(401);
      const headers = new Headers({
        upgrade: 'websocket',
        authorization: `Bearer ${grant}`,
      });
      for (const name of [
        'connection',
        'sec-websocket-key',
        'sec-websocket-version',
      ]) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      const room = rooms.get(rooms.idFromName(roomName(scope)));
      const response = await room.fetch(
        new Request('https://worlds-room.internal/room', { headers })
      );
      if (response.status === 101) return response;
      await response.body?.cancel();
      if (response.status !== 429) return reject(response.status);
    }
    return reject(429);
  } catch {
    return reject(503);
  }
}
