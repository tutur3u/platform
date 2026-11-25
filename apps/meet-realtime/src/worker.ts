import type { ChannelRoomEnv } from './channel-room-do';
import { channelRequest } from './channel-worker';

export { ChannelRoomDurableObject } from './channel-room-do';

import type { CollaborationRoomEnv } from './collaboration-room-do';
import { collaborationRequest } from './collaboration-worker';

export { CollaborationRoomDurableObject } from './collaboration-room-do';

import type { WhiteboardRoomEnv } from './whiteboard-room-do';
import { whiteboardRequest } from './whiteboard-worker';

export { WhiteboardRoomDurableObject } from './whiteboard-room-do';

import { ATTENDANCE_DIRECTORY_ROOM } from '../../../packages/realtime/src/meet/attendance-directory';
import { verifyMeetServiceCredential } from '../../../packages/realtime/src/meet/service-credential';
import { meetRoomRequest } from './meet-room-worker';
import type { MeetRoomEnv } from './room-do';

export { MeetRoomDurableObject } from './room-do';
export { AttendanceErasure } from './attendance-erasure-entrypoint';

/**
 * Cloudflare Worker entry for Tuturuuu Meet realtime.
 *
 * The Worker only authenticates the join token and routes the upgrade to the
 * room's Durable Object; all room state and every Cloudflare Realtime SFU call
 * happens inside the object so a room has exactly one authority.
 */
export default {
  async fetch(
    request: Request,
    env: MeetRoomEnv & CollaborationRoomEnv & ChannelRoomEnv & WhiteboardRoomEnv
  ): Promise<Response> {
    const url = new URL(request.url);
    if (
      ['/channels', '/channels/publish', '/channels/document'].includes(
        url.pathname
      )
    )
      return channelRequest(request, env);

    if (
      [
        '/collaboration',
        '/collaboration/seed',
        '/collaboration/checkpoint',
        '/collaboration/runner-files',
        '/collaboration/mira-code',
      ].includes(url.pathname)
    )
      return collaborationRequest(request, env);

    if (url.pathname === '/whiteboard') return whiteboardRequest(request, env);

    if (url.pathname === '/health') {
      return Response.json({ ok: true });
    }

    if (
      (url.pathname === '/class-service' ||
        url.pathname === '/attendance-index') &&
      request.method === 'POST'
    ) {
      const credential = verifyMeetServiceCredential(
        request.headers
          .get('Authorization')
          ?.match(/^Bearer\s+(\S+)\s*$/i)?.[1] ?? '',
        env.MEET_REALTIME_TOKEN_SECRET
      );
      if (!credential) return new Response('Unauthorized', { status: 401 });
      const roomName =
        url.pathname === '/attendance-index'
          ? ATTENDANCE_DIRECTORY_ROOM
          : credential.roomId;
      const room = env.MEET_ROOM.get(env.MEET_ROOM.idFromName(roomName));
      return room.fetch(request);
    }

    return meetRoomRequest(request, url, env);
  },
};
