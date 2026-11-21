import {
  getAppMountBasePaths,
  SHARED_APP_ORIGIN,
} from '@tuturuuu/utils/app-mounts';
import type { AppName } from '@tuturuuu/utils/internal-domains';
import { type NextRequest, NextResponse } from 'next/server';
import { appLogoutFenceResponse, withAppLogoutFence } from './logout-fence';
import { normalizeAuthRedirectPath } from './redirect-path';
import { mountedSessionFailureResponse } from './mounted-failure';
import {
  consumeMountedSharedSession,
  resolveMountedSharedSession,
} from './mounted-shared-session';

type MountedAppAuthDependencies = {
  resolveMountedSharedSession: typeof resolveMountedSharedSession;
  consumeMountedSharedSession: typeof consumeMountedSharedSession;
};

/** Reads Web's shared session behind the app logout fence; Web owns refresh. */
export function createMountedAppAuth(
  { targetApp }: { targetApp: AppName | string },
  deps: MountedAppAuthDependencies = {
    resolveMountedSharedSession,
    consumeMountedSharedSession,
  }
) {
  const apex = new URL(SHARED_APP_ORIGIN);
  const options = {
    mode: 'supabase-only',
    nextUrlScope: 'app-relative',
    targetApp,
    webAppUrl: apex.origin,
  } as const;
  function isMounted(request: NextRequest) {
    return (
      request.nextUrl.origin === apex.origin &&
      getAppMountBasePaths(options.targetApp).includes(request.nextUrl.basePath)
    );
  }

  function resolveSession(request: NextRequest) {
    return withAppLogoutFence(request, () =>
      deps.resolveMountedSharedSession(request, {
        now: new Date(),
        targetApp: options.targetApp,
      })
    );
  }

  async function auth(request: NextRequest) {
    if (!isMounted(request))
      return new NextResponse('Not Found', { status: 404 });
    const path =
      request.nextUrl.pathname
        .replace(/^\/(en|vi)(?=\/|$)/u, '')
        .replace(/\/$/u, '') || '/';
    if (path === '/verify-token') {
      return deps.consumeMountedSharedSession(request, options, {
        refresh: resolveSession,
      });
    }
    const loginUrl = () => {
      const login = new URL('/login', apex);
      const callback = new URL(
        `${request.nextUrl.basePath}/verify-token`,
        apex
      );
      callback.searchParams.set(
        'nextUrl',
        path === '/login'
          ? normalizeAuthRedirectPath(
              request.nextUrl.searchParams.get('next') ??
                request.nextUrl.searchParams.get('nextUrl'),
              apex.origin,
              '/'
            )
          : `${request.nextUrl.pathname}${request.nextUrl.search}`
      );
      login.searchParams.set('returnUrl', callback.href);
      return login;
    };
    const signedOut = appLogoutFenceResponse(request, loginUrl);
    if (signedOut) return signedOut;
    const session = await resolveSession(request);
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

  return { isMounted, resolveSession, auth };
}
