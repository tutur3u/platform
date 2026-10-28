import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { NextRequest } from 'next/server';
import { getRequestVerifiedUser } from './request-verified-user';
import { accountAssuranceCredentials } from './required-mfa-credentials';
import { checkRequiredAccountMfa } from './required-mfa-request';

/** Only call after the provider has cryptographically verified these claims.
 * Retain a consumed mobile approval's original boundary and expiry in handoffs.
 */
export async function resolveVerifiedSupabaseMfa(
  claims: Record<string, unknown>,
  /** The incoming request whose provider session produced `claims`. */
  request?: NextRequest
) {
  if (typeof claims.sub !== 'string') throw new Error('Invalid session');
  const admin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const getUser = async () => {
    const providerTokens = request
      ? accountAssuranceCredentials(request).filter((t) => t.startsWith('eyJ'))
      : [];
    // Reuse the request's lookup only for one unambiguous provider session
    // that the server resolves to the same principal; otherwise look up fresh.
    if (providerTokens.length === 1 && request) {
      const [token] = providerTokens as [string];
      const verified = await getRequestVerifiedUser(request, token, () =>
        admin.auth.getUser(token)
      ).catch(() => null);
      if (!verified?.error && verified?.data.user?.id === claims.sub)
        return verified;
    }
    return admin.auth.admin.getUserById(claims.sub as string);
  };
  const result = await checkRequiredAccountMfa(
    { headers: new Headers() },
    {
      createAdminClient: async () => admin,
      createUserClient: async () =>
        ({
          auth: {
            getUser,
            getClaims: async () => ({ data: { claims }, error: null }),
          },
        }) as unknown as TypedSupabaseClient,
      nowSeconds: () => Math.floor(Date.now() / 1000),
    },
    { userId: claims.sub }
  );
  if (result.status === 'unavailable' || result.status === 'invalid')
    throw new Error('Account assurance unavailable');
  return result;
}
