// OpenNext owns the web application; only the authenticated Live upgrade is intercepted.
import nextWorker from '../.open-next/worker.js';

export {
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache,
} from '../.open-next/worker.js';

import { verifyLiveSession } from '../src/features/live-assistant/token';
import type { LiveEnvironment } from './live/storage';

export { MeetLiveDurableObject } from './live/session';
export default {
  async fetch(
    request: Request,
    env: LiveEnvironment & { MEET_LIVE: DurableObjectNamespace },
    ctx: ExecutionContext
  ) {
    const url = new URL(request.url);
    if (url.pathname === '/live-connect') {
      if (
        request.method !== 'GET' ||
        request.headers.get('Origin') !== env.NEXT_PUBLIC_APP_URL ||
        request.headers.get('Upgrade') !== 'websocket'
      )
        return new Response('Forbidden', { status: 403 });
      const protocols =
        request.headers
          .get('Sec-WebSocket-Protocol')
          ?.split(',')
          .map((v) => v.trim()) ?? [];
      if (!protocols.includes('meet-live'))
        return new Response('Invalid protocol', { status: 400 });
      const token =
        protocols.find((value) => value.startsWith('auth.'))?.slice(5) ?? '';
      const claims = verifyLiveSession(token, env.MEET_REALTIME_TOKEN_SECRET);
      if (!claims) return new Response('Unauthorized', { status: 401 });
      return env.MEET_LIVE.get(
        env.MEET_LIVE.idFromName(claims.sessionId)
      ).fetch(request.url, {
        method: 'GET',
        headers: Object.fromEntries(request.headers),
      });
    }
    return nextWorker.fetch(request, env, ctx);
  },
};
