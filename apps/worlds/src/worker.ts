import handler from '@tanstack/react-start/server-entry';
import { ROOM_SOCKET_PATH } from './multiplayer/room-protocol.ts';
import {
  handleRoomUpgrade,
  type WorldsRoomEnv,
} from './multiplayer/room-upgrade.ts';

export { WorldRoom } from './multiplayer/room.ts';

export default {
  fetch(request: Request, env: WorldsRoomEnv) {
    if (new URL(request.url).pathname === ROOM_SOCKET_PATH)
      return handleRoomUpgrade(request, env);
    return handler.fetch(request);
  },
};
