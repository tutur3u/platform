import { forwardToCentralApi } from '@tuturuuu/start-bridge/api-forward';
import { retarget } from '@tuturuuu/start-bridge/base-path';
import { matchRoute } from '@tuturuuu/start-bridge/route-match';
import { runtimeAppBase } from '@tuturuuu/start-bridge/start/base-path';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { resolveTuturuuuWebAppUrl } from '@tuturuuu/utils/next-config';
import { workerBuildInfo } from '@tuturuuu/utils/worker-build-info';
import { proxy } from '../proxy';
import { endpoints } from './api-registry.bridge.gen';
import { MAIL_FUNCTION_BASE } from './mail-api-policy';
import { registerMailServerApiPaths } from './mail-api-server';
import { mailAppPath, mailMounts } from './mail-mount';
import { prepareMailFunctionRequest } from './native-function-body';
import { nativeFunctionProxy } from './native-function-proxy';
import { proxyMatches } from './proxy-bridge';
import { publicAssets } from './public-assets';
import { applyMailResponsePolicy } from './response-policy';
import type { MailExecutionContext, MailRuntimeEnv } from './worker-contract';

registerMailServerApiPaths();

const dispatch = createBridgeHandler<MailRuntimeEnv, MailExecutionContext>({
  mounts: mailMounts,
  start: createBridgeStartHandler(),
  serverFnBase: MAIL_FUNCTION_BASE,
  proxy,
  endpoints,
  functionBase: MAIL_FUNCTION_BASE,
  functionProxy: nativeFunctionProxy,
  publicAssets,
  assets: (env) => env.ASSETS,
  centralApiOrigin: () => resolveTuturuuuWebAppUrl(),
  forwardApi: (request, origin) => {
    if (runtimeAppBase())
      return Promise.resolve(new Response('Not Found', { status: 404 }));
    // Web auth callbacks use the original serving host; overwrite client-supplied forwarding headers.
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', url.host);
    headers.set('x-forwarded-proto', url.protocol.slice(0, -1));
    return forwardToCentralApi(new Request(request, { headers }), origin);
  },
  matches: proxyMatches,
});

export async function handleMailRequest(
  request: Request,
  env: MailRuntimeEnv,
  ctx: MailExecutionContext
) {
  const path = mailAppPath(request);
  if (path === null)
    return applyMailResponsePolicy(
      request,
      new Response('Not Found', { status: 404 })
    );
  if (
    new URL(request.url).pathname.startsWith('/mail/') &&
    [
      '/api/auth/refresh-app-session',
      '/api/auth/verify-app-token',
      '/api/auth/logout',
    ].some((pattern) => matchRoute(pattern, path) !== null)
  )
    return applyMailResponsePolicy(
      request,
      Response.json(
        { error: 'The shared session is managed by Web' },
        { status: 409 }
      )
    );
  if (path === '/api/build-info') {
    const url = new URL(request.url);
    url.pathname = path;
    const identity = workerBuildInfo(retarget(request, url), 'mail');
    if (identity) return applyMailResponsePolicy(request, identity);
  }
  const prepared = await prepareMailFunctionRequest(request);
  if (prepared instanceof Response)
    return applyMailResponsePolicy(request, prepared);
  request = prepared;
  return applyMailResponsePolicy(request, await dispatch(request, env, ctx));
}
