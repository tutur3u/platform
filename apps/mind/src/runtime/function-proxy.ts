import {
  propagateAuthCookies,
  refreshAppSessionForRequest,
} from '@tuturuuu/auth/proxy';
import {
  mountedSessionFailureResponse,
  withoutExpiringCookies,
} from '@tuturuuu/auth/proxy/mounted-failure';
import { createFunctionProxy as createSharedFunctionProxy } from '../../../../packages/start-bridge/src/next/function-proxy';
import type { NextResponse } from 'next/server';
import {
  isExplicitBearerRequest,
  mountedAuthorizationRefusal,
  refusesMountedAuthorization,
} from './mounted-bearer';

type FunctionRequest = Parameters<
  ReturnType<typeof createSharedFunctionProxy>
>[0];

export function createFunctionProxy(
  options: Parameters<typeof createSharedFunctionProxy>[0]
) {
  const rootProxy = createSharedFunctionProxy(options);
  // The shared proxy clears unsupported provider cookies on its refusals; on
  // the apex those belong to Web, so the mount keeps only its cookie writes.
  const mountedRootProxy = async (request: FunctionRequest) =>
    withoutExpiringCookies(await rootProxy(request));

  async function mountedResponse(
    request: FunctionRequest
  ): Promise<NextResponse> {
    if (refusesMountedAuthorization(request))
      return mountedAuthorizationRefusal();
    if (isExplicitBearerRequest(request)) return mountedRootProxy(request);
    const session = await refreshAppSessionForRequest(request, {
      sessionMode: 'supabase-only',
      targetApp: 'mind',
    });
    if (!session.ok)
      return mountedSessionFailureResponse(
        request,
        session.error,
        session.response
      );
    const response = await mountedRootProxy(request);
    propagateAuthCookies(session.response, response);
    return response;
  }

  return async function mindFunctionProxy(request: FunctionRequest) {
    if (request.nextUrl.basePath !== '/mind') return rootProxy(request);
    // Every mounted server-function response is personalised.
    const response = await mountedResponse(request);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  };
}
