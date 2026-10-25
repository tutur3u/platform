import start from '@tanstack/react-start/server-entry';
import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import { appBasePath } from '@tuturuuu/start-bridge/start/base-path';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { resolveTuturuuuWebAppUrl } from '@tuturuuu/utils/web-app-url';
import { proxy } from '../proxy';
import { endpoints } from './api-registry.bridge.gen';
import { MAIL_FUNCTION_BASE } from './mail-api-policy';
import { boundNativeFunctionRequest } from './native-function-body';
import { nativeFunctionProxy } from './native-function-proxy';
import { proxyMatches } from './proxy-bridge';
import { publicAssets } from './public-assets';
import { applyMailResponsePolicy } from './response-policy';
import type { MailExecutionContext, MailRuntimeEnv } from './worker-contract';

const basePath = createBasePath({ app: 'mail', basePath: appBasePath() });
const dispatch = createBridgeHandler<MailRuntimeEnv, MailExecutionContext>({
  basePath,
  start,
  proxy,
  endpoints,
  functionBase: MAIL_FUNCTION_BASE,
  functionProxy: nativeFunctionProxy,
  publicAssets,
  assets: (env) => env.ASSETS,
  centralApiOrigin: () => resolveTuturuuuWebAppUrl(),
  matches: proxyMatches,
});

export async function handleMailRequest(
  request: Request,
  env: MailRuntimeEnv,
  ctx: MailExecutionContext
) {
  const path = basePath.strip(new URL(request.url).pathname);
  if (
    path === MAIL_FUNCTION_BASE ||
    path?.startsWith(`${MAIL_FUNCTION_BASE}/`)
  ) {
    const bounded = await boundNativeFunctionRequest(request);
    if (bounded instanceof Response)
      return applyMailResponsePolicy(request, bounded);
    request = bounded;
  }
  return applyMailResponsePolicy(request, await dispatch(request, env, ctx));
}
