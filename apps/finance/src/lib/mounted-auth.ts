import {
  consumeMountedSharedSession,
  resolveMountedSharedSession,
} from '@tuturuuu/auth/proxy';
import {
  appLogoutFenceResponse,
  withAppLogoutFence,
} from '@tuturuuu/auth/proxy/logout-fence';
import { mountedSessionFailureResponse } from '@tuturuuu/auth/proxy/mounted-failure';
import { type NextRequest, NextResponse } from 'next/server';
import { FINANCE_APEX_URL } from '../start-bridge/finance-mounts.mjs';

const apex = new URL(FINANCE_APEX_URL);
const options = {
  mode: 'supabase-only',
  nextUrlScope: 'app-relative',
  targetApp: 'finance',
  webAppUrl: apex.origin,
} as const;

export function isMountedFinance(request: NextRequest) {
  return (
    request.nextUrl.origin === apex.origin &&
    request.nextUrl.basePath === apex.pathname
  );
}

function resolveSession(request: NextRequest) {
  return withAppLogoutFence(request, () =>
    resolveMountedSharedSession(request, {
      now: new Date(),
      targetApp: options.targetApp,
    })
  );
}

export async function mountedFinanceAuth(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/^\/(en|vi)(?=\/|$)/u, '');
  if (path === '/verify-token') {
    return consumeMountedSharedSession(request, options, {
      refresh: resolveSession,
    });
  }
  const loginUrl = () => {
    const login = new URL('/login', apex);
    const callback = new URL(`${apex.pathname}/verify-token`, apex);
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
