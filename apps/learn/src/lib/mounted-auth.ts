import {
  consumeMountedSharedSession,
  resolveMountedSharedSession,
} from '@tuturuuu/auth/proxy';
import {
  appLogoutFenceResponse,
  withAppLogoutFence,
} from '@tuturuuu/auth/proxy/logout-fence';
import { mountedSessionFailureResponse } from '@tuturuuu/auth/proxy/mounted-failure';
import { getAppMountBasePaths } from '@tuturuuu/utils/app-mounts';
import { type NextRequest, NextResponse } from 'next/server';

/** Learn on the shared origin. */
export const LEARN_APEX_URL = 'https://tuturuuu.com/learn';

const apex = new URL(LEARN_APEX_URL);
const options = {
  mode: 'supabase-only',
  nextUrlScope: 'app-relative',
  targetApp: 'learn',
  webAppUrl: apex.origin,
} as const;

export function isMountedLearn(request: NextRequest) {
  return (
    request.nextUrl.origin === apex.origin &&
    getAppMountBasePaths(options.targetApp).includes(request.nextUrl.basePath)
  );
}

/**
 * The mount's session: the central Supabase access token Web keeps fresh,
 * behind the app logout fence. A mounted app holds no refresh token, so it
 * never refreshes or writes a session itself.
 */
export function resolveMountedLearnSession(request: NextRequest) {
  return withAppLogoutFence(request, () =>
    resolveMountedSharedSession(request, {
      now: new Date(),
      targetApp: options.targetApp,
    })
  );
}

/**
 * Page auth on `tuturuuu.com/learn`. A valid shared session continues; an
 * expired or missing one goes to Web's login, which returns through
 * `/learn/verify-token` once Web has refreshed it, so the mount never loops
 * on its own refresh attempt.
 */
export async function mountedLearnAuth(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/^\/(en|vi)(?=\/|$)/u, '');
  if (path === '/verify-token') {
    return consumeMountedSharedSession(request, options, {
      refresh: resolveMountedLearnSession,
    });
  }
  const loginUrl = () => {
    const login = new URL('/login', apex);
    const callback = new URL(`${request.nextUrl.basePath}/verify-token`, apex);
    callback.searchParams.set(
      'nextUrl',
      path === '/login'
        ? '/'
        : `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    login.searchParams.set('returnUrl', callback.href);
    return login;
  };
  const signedOut = appLogoutFenceResponse(request, loginUrl);
  if (signedOut) return signedOut;
  const session = await resolveMountedLearnSession(request);
  if (session.ok && path !== '/login') return session.response;
  if (!session.ok && session.error === 'Account assurance unavailable') {
    return mountedSessionFailureResponse(
      request,
      session.error,
      session.response
    );
  }
  const login = loginUrl();
  if (!session.ok && session.error === 'MFA required')
    login.searchParams.set('mfa', 'required');
  return NextResponse.redirect(login, {
    headers: { 'cache-control': 'private, no-store' },
  });
}
