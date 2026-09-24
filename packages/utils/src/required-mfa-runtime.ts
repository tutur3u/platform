import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyAppCoordinationToken } from './app-coordination-token';
import { accountAssuranceCredentials } from './required-mfa-credentials';
import { isAccountAssuranceRecoveryPath } from './required-mfa-proxy';
import { checkRequiredAccountMfa } from './required-mfa-request';

/** Check every usable cookie identity, so downstream target-app fallback cannot
 * borrow another session's assurance. Cookie-only legacy handlers can ignore a
 * Bearer header, so ambient credentials must be checked as well.
 * Uses explicit access tokens and never rotates browser refresh cookies. */
export async function enforceRequiredMfaRequest(request: NextRequest) {
  if (
    request.method === 'OPTIONS' ||
    isAccountAssuranceRecoveryPath(request.nextUrl.pathname)
  )
    return null;
  const credentials = accountAssuranceCredentials(request);
  if (!credentials.length) return null;
  try {
    const admin = (await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient;
    for (const token of credentials) {
      let userId: string;
      const appToken = token.startsWith('ttr_app_');
      if (appToken) {
        const verified = verifyAppCoordinationToken(token);
        if (!verified.ok) {
          if (
            request.headers
              .get('authorization')
              ?.match(/^Bearer\s+(\S+)$/i)?.[1] === token
          )
            return unauthenticated();
          continue; // An expired ambient app cookie cannot authenticate a route.
        }
        userId = verified.claims.sub;
      } else {
        const result = await admin.auth.getUser(token);
        if (result.error || !result.data.user) return unauthenticated();
        userId = result.data.user.id;
      }
      const result = await checkRequiredAccountMfa(
        request,
        {
          createAdminClient: async () => admin,
          createUserClient: async () =>
            ({
              auth: {
                getUser: () => admin.auth.getUser(token),
                getClaims: () => admin.auth.getClaims(token),
              },
            }) as unknown as TypedSupabaseClient,
          nowSeconds: () => Math.floor(Date.now() / 1000),
        },
        { userId, appToken: appToken ? token : undefined }
      );
      if (result.status === 'invalid') return unauthenticated();
      if (result.status !== 'allowed') {
        return NextResponse.json(
          {
            code:
              result.status === 'required'
                ? 'MFA_REQUIRED'
                : 'AUTH_UNAVAILABLE',
            error:
              result.status === 'required'
                ? 'MFA verification required'
                : 'Unable to verify account security',
          },
          {
            status: result.status === 'required' ? 403 : 503,
            headers: {
              'Cache-Control': 'no-store',
              'X-Tuturuuu-Auth-Assurance': result.status,
            },
          }
        );
      }
    }
    return null;
  } catch {
    return NextResponse.json(
      { code: 'AUTH_UNAVAILABLE', error: 'Unable to verify account security' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'X-Tuturuuu-Auth-Assurance': 'unavailable',
        },
      }
    );
  }
}

function unauthenticated() {
  return NextResponse.json(
    { code: 'UNAUTHENTICATED', error: 'Authentication required' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } }
  );
}
