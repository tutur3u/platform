import {
  propagateAuthCookies,
  refreshAppSessionForRequest,
} from '@tuturuuu/auth/proxy';
import {
  mountedSessionFailureResponse,
  withoutExpiringCookies,
} from '@tuturuuu/auth/proxy/mounted-failure';
import { getAppBasePath } from '@tuturuuu/utils/app-mounts';
import type { NextResponse } from 'next/server';
import { createFunctionProxy as createSharedFunctionProxy } from '../../../../packages/start-bridge/src/next/function-proxy';
import {
  isExplicitBearerRequest,
  mountedAuthorizationRefusal,
  refusesMountedAuthorization,
} from './mounted-bearer';

type FunctionRequest = Parameters<
  ReturnType<typeof createSharedFunctionProxy>
>[0];

const ADMIN_BASE_PATH = getAppBasePath('infra');

/**
 * Server functions under the Admin apex mount. The shared proxy skips session
 * checks for mounted requests, so the mount resolves the provider-only
 * session (including MFA and assurance) before any Admin action runs, and
 * never expires the central Web cookies on a refusal.
 */
export function createFunctionProxy(
  options: Parameters<typeof createSharedFunctionProxy>[0]
) {
  const rootProxy = createSharedFunctionProxy(options);
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
      targetApp: 'infra',
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

  return async function adminFunctionProxy(request: FunctionRequest) {
    if (request.nextUrl.basePath !== ADMIN_BASE_PATH) return rootProxy(request);
    // Every mounted server-function response is personalised.
    const response = await mountedResponse(request);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  };
}
