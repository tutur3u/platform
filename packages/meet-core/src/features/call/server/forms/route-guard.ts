import 'server-only';

import { roomRoute } from '../room-service';
import { isMeetFormsEnabled } from './enabled';

export async function meetFormsRoute(...args: Parameters<typeof roomRoute>) {
  if (!isMeetFormsEnabled()) {
    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  return roomRoute(...args);
}
