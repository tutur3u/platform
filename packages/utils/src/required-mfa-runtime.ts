import { createHash } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyAppCoordinationToken } from './app-coordination-token';
import { guardRejection } from './guard-rejection';
import {
  getRequestVerifiedUser,
  type VerifiedUserResult,
} from './request-verified-user';
import { accountAssuranceCredentials } from './required-mfa-credentials';
import { isAccountAssuranceRecoveryPath } from './required-mfa-proxy';
import { checkRequiredAccountMfa } from './required-mfa-request';

type RequestIdentity = Pick<NextRequest, 'headers' | 'url'> &
  Partial<Pick<NextRequest, 'method' | 'nextUrl'>>;
type RequestAssurance = {
  response: NextResponse | null;
  bearerUser: SupabaseUser | null;
};
type CachedRequestAssurance = {
  fingerprint: string;
  pending: Promise<RequestAssurance>;
  verified: RequestAssurance | null;
};
const requestAssurance = new WeakMap<object, CachedRequestAssurance>();
function fingerprint(request: RequestIdentity) {
  return createHash('sha256')
    .update(request.nextUrl?.href ?? request.url)
    .update('\0')
    .update(request.method ?? '')
    .update('\0')
    .update(request.headers.get('authorization') ?? '')
    .update('\0')
    .update(request.headers.get('cookie') ?? '')
    .digest('hex');
}
/** Only an exact in-process request with unchanged credentials can reuse assurance.
 * Next proxy/route boundaries may create a different object and must verify again. */
export function getVerifiedMfaBearerUser(
  request: RequestIdentity
): SupabaseUser | null {
  const cached = requestAssurance.get(request);
  if (
    !request.headers.get('authorization')?.startsWith('Bearer ') ||
    !cached ||
    cached.fingerprint !== fingerprint(request) ||
    cached.verified?.response
  )
    return null;
  return cached.verified?.bearerUser ?? null;
}
export async function enforceRequiredMfaRequest(
  request: NextRequest,
  onVerifiedBearerActor?: (userId: string) => void
) {
  const identity = fingerprint(request);
  let cached = requestAssurance.get(request);
  if (!cached || cached.fingerprint !== identity) {
    const entry: CachedRequestAssurance = {
      fingerprint: identity,
      pending: Promise.resolve<RequestAssurance>({
        response: null,
        bearerUser: null,
      }),
      verified: null,
    };
    entry.pending = (async () => {
      let bearerUser: SupabaseUser | null = null;
      const response = await enforceUncachedRequiredMfaRequest(
        request,
        (user) => {
          bearerUser = user;
        }
      );
      const result = { response, bearerUser: response ? null : bearerUser };
      entry.verified = result;
      return result;
    })();
    requestAssurance.set(request, entry);
    cached = entry;
  }
  const result = await cached.pending;
  if (fingerprint(request) !== identity) return unauthenticated(request);
  if (!result.response && result.bearerUser)
    onVerifiedBearerActor?.(result.bearerUser.id);
  return result.response;
}

/** Check every usable cookie identity, so downstream target-app fallback cannot
 * borrow another session's assurance. Cookie-only legacy handlers can ignore a
 * Bearer header, so ambient credentials must be checked as well.
 * Uses explicit access tokens and never rotates browser refresh cookies. */
async function enforceUncachedRequiredMfaRequest(
  request: NextRequest,
  onVerifiedBearerUser: (user: SupabaseUser) => void
) {
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
      let providerUser: SupabaseUser | null = null;
      let providerVerification: Promise<VerifiedUserResult> | undefined;
      // One server-revalidated lookup per request and credential, shared with
      // the session refresh that ran earlier on this same request object.
      const getProviderUser = () =>
        (providerVerification ??= getRequestVerifiedUser(request, token, () =>
          admin.auth.getUser(token)
        ));
      const appToken = token.startsWith('ttr_app_');
      if (appToken) {
        const verified = verifyAppCoordinationToken(token);
        if (!verified.ok) {
          if (
            request.headers
              .get('authorization')
              ?.match(/^Bearer\s+(\S+)$/i)?.[1] === token
          )
            return unauthenticated(request);
          continue; // An expired ambient app cookie cannot authenticate a route.
        }
        userId = verified.claims.sub;
      } else {
        const result = await getProviderUser();
        if (result.error || !result.data.user) return unauthenticated(request);
        userId = result.data.user.id;
        providerUser = result.data.user;
      }
      const result = await checkRequiredAccountMfa(
        request,
        {
          createAdminClient: async () => admin,
          createUserClient: async () =>
            ({
              auth: {
                getUser: getProviderUser,
                getClaims: () => admin.auth.getClaims(token),
              },
            }) as unknown as TypedSupabaseClient,
          nowSeconds: () => Math.floor(Date.now() / 1000),
          getAppTokenUser: (id) =>
            getRequestVerifiedUser(request, token, () =>
              admin.auth.admin.getUserById(id)
            ),
        },
        { userId, appToken: appToken ? token : undefined }
      );
      if (result.status === 'invalid') return unauthenticated(request);
      if (result.status !== 'allowed') {
        return guardRejection(
          request,
          NextResponse.json(
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
          ),
          result.status === 'required'
            ? 'auth-assurance-required'
            : 'auth-assurance-unavailable'
        );
      }
      if (
        !appToken &&
        request.headers
          .get('authorization')
          ?.match(/^Bearer\s+(\S+)$/i)?.[1] === token &&
        providerUser
      )
        onVerifiedBearerUser(providerUser);
    }
    return null;
  } catch {
    return guardRejection(
      request,
      NextResponse.json(
        {
          code: 'AUTH_UNAVAILABLE',
          error: 'Unable to verify account security',
        },
        {
          status: 503,
          headers: {
            'Cache-Control': 'no-store',
            'X-Tuturuuu-Auth-Assurance': 'unavailable',
          },
        }
      ),
      'auth-assurance-unavailable'
    );
  }
}

function unauthenticated(request: RequestIdentity) {
  return guardRejection(
    request,
    NextResponse.json(
      { code: 'UNAUTHENTICATED', error: 'Authentication required' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    ),
    'auth-assurance-unauthenticated'
  );
}
