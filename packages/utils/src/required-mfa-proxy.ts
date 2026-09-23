import { type NextRequest, NextResponse } from 'next/server';
import {
  type AccountAssuranceDependencies,
  checkRequiredAccountMfa,
} from './required-mfa-request';

// These endpoints establish/recover assurance and still perform their own
// authentication, challenge validation and rate limiting. Never exempt general
// user, workspace, or administrative APIs from the account policy.
const RECOVERY_PATHS = new Set([
  // These exact handoff handlers enforce current policy on the verified body
  // token. Expired ambient cookies must not prevent obtaining a new session.
  '/api/auth/verify-app-token',
  '/api/auth/refresh-app-session',
  '/api/v1/auth/cross-app-token/verify',
  '/api/v1/auth/cross-app-session/refresh',
  '/api/cli/auth/refresh',
  '/api/v1/auth/mfa/devices',
  '/api/v1/auth/mfa/mobile/challenges',
  '/api/v1/auth/mfa/mobile/approvals',
  '/api/v1/auth/accounts/logout',
  '/api/v1/auth/accounts/logout-all',
]);

export function isAccountAssuranceRecoveryPath(pathname: string): boolean {
  return (
    RECOVERY_PATHS.has(pathname) ||
    /^\/api\/v1\/auth\/mfa\/mobile\/challenges\/[0-9a-f-]{36}(?:\/approve)?$/i.test(
      pathname
    )
  );
}

/** Additional interactive-session assurance check; the caller must first
 * distinguish independently authenticated machine/webhook credentials and
 * supply a request-bound auth client appropriate for its runtime. The proxy
 * must not use next/headers or rotate refresh cookies without propagating them.
 */
export async function guardRequiredAccountMfa(
  request: NextRequest,
  dependencies: AccountAssuranceDependencies,
  principal: { userId: string; appToken?: string }
): Promise<NextResponse | null> {
  if (
    request.method === 'OPTIONS' ||
    isAccountAssuranceRecoveryPath(request.nextUrl.pathname)
  )
    return null;
  const authorization = request.headers.get('authorization');
  const cookies = request.headers.get('cookie') ?? '';
  const hasInteractiveCredential = Boolean(
    authorization?.match(/^Bearer\s+(?:eyJ|ttr_app_)/i) ||
      /(?:^|;\s*)(?:sb-[^=]+-auth-token(?:\.\d+)?|tuturuuu_(?:web_)?app_session)=/.test(
        cookies
      )
  );
  if (!hasInteractiveCredential) return null;
  const result = await checkRequiredAccountMfa(
    request,
    dependencies,
    principal
  );
  if (result.status === 'allowed') return null;
  const status =
    result.status === 'unavailable'
      ? 503
      : result.status === 'invalid'
        ? 401
        : 403;
  return NextResponse.json(
    {
      code:
        result.status === 'required'
          ? 'MFA_REQUIRED'
          : result.status === 'invalid'
            ? 'UNAUTHENTICATED'
            : 'AUTH_UNAVAILABLE',
      error:
        result.status === 'required'
          ? 'MFA verification required'
          : result.status === 'invalid'
            ? 'Authentication required'
            : 'Unable to verify account security',
    },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}
