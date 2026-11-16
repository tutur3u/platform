import {
  appSessionFailureResponse,
  propagateAuthCookies,
  refreshAppSessionForRequest,
} from '@tuturuuu/auth/proxy';
import { createFunctionProxy as createSharedFunctionProxy } from '../../../../packages/start-bridge/src/next/function-proxy';
import { NextResponse } from 'next/server';
import {
  isExplicitBearerRequest,
  rejectsLegacyMountedBearer,
} from './mounted-bearer';

export function createFunctionProxy(
  options: Parameters<typeof createSharedFunctionProxy>[0]
) {
  const rootProxy = createSharedFunctionProxy(options);
  return async function mindFunctionProxy(
    request: Parameters<ReturnType<typeof createSharedFunctionProxy>>[0]
  ) {
    if (request.nextUrl.basePath !== '/mind') return rootProxy(request);
    if (rejectsLegacyMountedBearer(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
      );
    }
    if (isExplicitBearerRequest(request)) return rootProxy(request);
    const session = await refreshAppSessionForRequest(request, {
      sessionMode: 'supabase-only',
      targetApp: 'mind',
    });
    if (!session.ok)
      return appSessionFailureResponse(
        request,
        session.error,
        session.response
      );
    const response = await rootProxy(request);
    propagateAuthCookies(session.response, response);
    return response;
  };
}
