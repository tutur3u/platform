import start from '@tanstack/react-start/server-entry';
import { resolveTuturuuuWebAppUrl } from '@tuturuuu/utils/next-config';
import {
  applyOneOriginNoindex,
  decideOneOriginRequest,
} from '@tuturuuu/utils/one-origin-routing';
import { proxy } from '../proxy';
import { dispatchMailEndpoint } from './api-registry.server';
import { MAIL_FUNCTION_BASE } from './mail-api-policy';
import { boundNativeFunctionRequest } from './native-function-body';
import { nativeFunctionProxy } from './native-function-proxy';
import { mailOneOriginConfig } from './one-origin';
import { dispatchThroughMailProxy } from './proxy-bridge';
import { publicAssets } from './public-assets';
import { applyMailResponsePolicy } from './response-policy';
import type { MailExecutionContext, MailRuntimeEnv } from './worker-contract';

async function dispatchMailRequest(
  request: Request,
  env: MailRuntimeEnv,
  ctx: MailExecutionContext
) {
  const path = new URL(request.url).pathname;
  if (
    path === MAIL_FUNCTION_BASE ||
    path.startsWith(`${MAIL_FUNCTION_BASE}/`)
  ) {
    const bounded = await boundNativeFunctionRequest(request);
    if (bounded instanceof Response) return bounded;
    request = bounded;
  }
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    (path.startsWith('/assets/') || publicAssets.has(path))
  )
    return env.ASSETS.fetch(request);
  return dispatchThroughMailProxy({
    request,
    proxy:
      path === MAIL_FUNCTION_BASE || path.startsWith(`${MAIL_FUNCTION_BASE}/`)
        ? nativeFunctionProxy
        : proxy,
    waitUntil: (work) => ctx.waitUntil(work),
    cloudflare: { env, ctx },
    dispatch: async (forwarded) => {
      const endpoint = await dispatchMailEndpoint(forwarded);
      if (endpoint) return endpoint;
      if (
        forwarded.nextUrl.pathname === '/api' ||
        forwarded.nextUrl.pathname.startsWith('/api/')
      ) {
        const destination = new URL(
          `${forwarded.nextUrl.pathname}${forwarded.nextUrl.search}`,
          resolveTuturuuuWebAppUrl()
        );
        const headers = new Headers(forwarded.headers);
        headers.delete('host');
        headers.set('x-forwarded-host', forwarded.nextUrl.host);
        headers.set(
          'x-forwarded-proto',
          forwarded.nextUrl.protocol.replace(':', '')
        );
        return fetch(
          new Request(
            destination,
            new Request(forwarded, { headers, redirect: 'manual' })
          )
        );
      }
      // The locale rewrite supplies server context, while Start must hydrate the
      // browser-visible URL rather than the internal Next middleware pathname.
      return start.fetch(new Request(request.url, forwarded));
    },
  });
}

export async function handleMailRequest(
  incoming: Request,
  env: MailRuntimeEnv,
  ctx: MailExecutionContext
) {
  const decision = decideOneOriginRequest(incoming, mailOneOriginConfig(env));
  if (decision.action !== 'serve') return decision.response;
  const { request } = decision;
  const response = applyMailResponsePolicy(
    request,
    await dispatchMailRequest(request, env, ctx)
  );
  return decision.noindex ? applyOneOriginNoindex(response) : response;
}
