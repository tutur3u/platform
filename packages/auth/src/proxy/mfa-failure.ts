import { type NextRequest, NextResponse } from 'next/server';
import { clearSupabaseAuthCookies } from '../app-session';

/** Keep the authenticated session available for enrollment/challenge. Clearing
 * it on MFA_REQUIRED causes a password-login loop and loses mobile approvals. */
export function appSessionFailureResponse(
  request: NextRequest,
  error: string,
  refreshed?: Response
) {
  if (error === 'MFA required' || error === 'Account assurance unavailable') {
    const required = error === 'MFA required';
    const response = NextResponse.json(
      {
        code: required ? 'MFA_REQUIRED' : 'AUTH_UNAVAILABLE',
        error: required
          ? 'MFA verification required'
          : 'Unable to verify account security',
      },
      {
        status: required ? 403 : 503,
        headers: {
          'Cache-Control': 'no-store',
          'X-Tuturuuu-Auth-Assurance': required ? 'required' : 'unavailable',
        },
      }
    );
    for (const cookie of refreshed?.headers.getSetCookie() ?? [])
      response.headers.append('set-cookie', cookie);
    return response;
  }
  return clearSupabaseAuthCookies(
    request,
    NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  );
}

export function preserveMfaRecoveryCookies(
  request: NextRequest,
  response: NextResponse
) {
  return response.headers.has('X-Tuturuuu-Auth-Assurance')
    ? response
    : clearSupabaseAuthCookies(request, response);
}
