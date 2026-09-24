import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { checkRequiredAccountMfa } from './required-mfa-request';

/** Only call after the provider has cryptographically verified these claims.
 * Retain a consumed mobile approval's original boundary and expiry in handoffs.
 */
export async function resolveVerifiedSupabaseMfa(
  claims: Record<string, unknown>
) {
  if (typeof claims.sub !== 'string') throw new Error('Invalid session');
  const admin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const result = await checkRequiredAccountMfa(
    { headers: new Headers() },
    {
      createAdminClient: async () => admin,
      createUserClient: async () =>
        ({
          auth: {
            getUser: () => admin.auth.admin.getUserById(claims.sub as string),
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
