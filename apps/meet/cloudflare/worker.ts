import {
  type AnalyticsEngineWriter,
  readCountry,
} from '@tuturuuu/utils/app-switch-rum';
import {
  createAppSwitchWriteBudget,
  handleAppSwitchBeacon,
} from '@tuturuuu/utils/app-switch-rum-ingest';
import {
  applyOneOriginNoindex,
  decideOneOriginRequest,
} from '@tuturuuu/utils/one-origin-routing';
import { verifyLiveSession } from '../src/features/live-assistant/token';
import { handleMeetRequest } from '../src/runtime/handler';
import { meetOneOriginConfig } from './one-origin';
import { applyMeetDocumentHeaders } from './security-profile';

/** Per-isolate app-switch metrics write budget (see app-switch-rum). */
const appSwitchWriteBudget = createAppSwitchWriteBudget();

export { MeetLiveDurableObject } from './live/session';
export { MeetingAIProvider } from './provider';
export default {
  async fetch(incoming: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    const decision = decideOneOriginRequest(incoming, meetOneOriginConfig(env));
    if (decision.action !== 'serve') return decision.response;
    const response = applyMeetDocumentHeaders(
      incoming,
      await serveMeet(decision.request, env, ctx),
      env
    );
    return decision.noindex ? applyOneOriginNoindex(response) : response;
  },
};

async function serveMeet(
  request: Request,
  env: CloudflareEnv,
  ctx: ExecutionContext
) {
  const url = new URL(request.url);
  if (url.pathname === '/_rum' || url.pathname === '/meet/_rum')
    return handleAppSwitchBeacon(
      request,
      (env as { APP_SWITCH_RUM?: AnalyticsEngineWriter }).APP_SWITCH_RUM,
      {
        ingest: (env as { APP_SWITCH_RUM_INGEST?: unknown })
          .APP_SWITCH_RUM_INGEST,
        budget: appSwitchWriteBudget,
        // No durable admission is bound yet, so ingest cannot write. The
        // admission and the dataset binding ship together, after review.
        admission: undefined,
        country: readCountry(request),
      }
    );
  if (url.pathname === '/.well-known/meeting-runtime')
    return Response.json(
      { version: 1 },
      { headers: { 'Cache-Control': 'no-store' } }
    );
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
    return env.MEET_LIVE.get(env.MEET_LIVE.idFromName(claims.sessionId)).fetch(
      request.url,
      {
        method: 'GET',
        headers: Object.fromEntries(request.headers),
      }
    );
  }
  return handleMeetRequest(request, env, ctx);
}
