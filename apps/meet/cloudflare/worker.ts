import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
import { verifyLiveSession } from '../src/features/live-assistant/token';
import { handleMeetRequest } from '../src/runtime/handler';
import {
  isMeetStagingCanonical,
  meetDocumentOrigin,
  meetMounts,
} from '../src/runtime/mount-config';

export { MeetLiveDurableObject } from './live/session';
export { MeetingAIProvider } from './provider';
export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    if (isMeetStagingCanonical(request, env))
      return new Response('Staging cannot serve a canonical host', {
        status: 503,
      });
    const url = new URL(request.url);
    const mount = resolveAppBase(url, meetMounts(env));
    if (!mount) return new Response('Not Found', { status: 404 });
    const path = createBasePath({
      app: 'meet',
      basePath: mount.basePath,
    }).strip(url.pathname);
    if (path === '/.well-known/meeting-runtime')
      return Response.json(
        { version: 1 },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    if (path === '/live-connect') {
      if (
        request.method !== 'GET' ||
        request.headers.get('Origin') !== meetDocumentOrigin(mount.mode, env) ||
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
    return handleMeetRequest(request, env, ctx);
  },
};
