import './bridge-runtime';
import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { resolveTuturuuuWebAppUrl } from '@tuturuuu/utils/next-config';
import { proxy } from '../proxy';
import { meetEndpoints } from './api-registry';
import { createLoginRedirectProbe } from './login-redirect-diagnostics';
import { isMeetStagingCanonical, meetMounts } from './mount-config';
import { MEET_FUNCTION_BASE } from './native-function-config';
import { nativeFunctionProxy } from './native-function-proxy';
import { publicAssets } from './public-assets';
import { classifyMeetSsrRequest, observeMeetSsr } from './ssr-diagnostics';
import type { MeetExecutionContext, MeetRuntimeBindings } from './worker-port';

const start = createBridgeStartHandler();

export function handleMeetRequest(
  request: Request,
  env: MeetRuntimeBindings,
  ctx: MeetExecutionContext
) {
  if (isMeetStagingCanonical(request, env))
    return new Response('Staging cannot serve a canonical host', {
      status: 503,
    });
  const mounts = meetMounts(env);
  const mount = resolveAppBase(new URL(request.url), mounts);
  if (!mount) return new Response('Not Found', { status: 404 });
  const base = createBasePath({ app: 'meet', basePath: mount.basePath });
  const diagnosticUrl = new URL(request.url);
  diagnosticUrl.pathname = base.strip(diagnosticUrl.pathname) ?? '/';
  const scope = classifyMeetSsrRequest(new Request(diagnosticUrl));
  const probe =
    scope === 'login' ? createLoginRedirectProbe(request.url) : undefined;
  const handle = createBridgeHandler<MeetRuntimeBindings, MeetExecutionContext>(
    {
      mounts,
      start: {
        fetch: (forwarded) =>
          observeMeetSsr(
            'handler',
            async () => {
              const response = await start.fetch(forwarded);
              try {
                probe?.observeStart(response);
              } catch {
                /* Diagnostics preserve the owning response. */
              }
              return response;
            },
            { scope, stage: 'start' }
          ),
      },
      proxy,
      endpoints: meetEndpoints,
      functionBase: MEET_FUNCTION_BASE,
      serverFnBase: MEET_FUNCTION_BASE,
      functionProxy: nativeFunctionProxy,
      publicAssets,
      assets: (bindings) => bindings.ASSETS,
      centralApiOrigin: () => resolveTuturuuuWebAppUrl(),
      observeNavigation: probe?.observeNavigation,
    }
  );
  const result = observeMeetSsr(
    'handler',
    () => handle(request, env, ctx),
    { scope, stage: 'proxy' },
    probe?.seal
  );
  if (env.TUTURUUU_NOINDEX !== '1') return result;
  return Promise.resolve(result).then((response) => {
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
}
