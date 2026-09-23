import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { mfaProofFromVerifiedClaims } from '@tuturuuu/utils/required-mfa-policy';
import { checkRequiredAccountMfa } from '@tuturuuu/utils/required-mfa-request';
import { createMfaTransfer } from '@tuturuuu/utils/required-mfa-transfer';

/** Browser/CLI handoffs must carry server-signed assurance, never raw metadata. */
export async function generateAssuredCrossAppToken(
  request: Request,
  supabase: TypedSupabaseClient,
  targetApp: string,
  originApp: string,
  expirySeconds = 300
): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const assurance = await checkRequiredAccountMfa(
    request,
    {
      createUserClient: async () => supabase,
      createAdminClient: async () =>
        (await createAdminClient({ noCookie: true })) as TypedSupabaseClient,
      nowSeconds: () => Math.floor(Date.now() / 1000),
    },
    { userId: data.user.id }
  );
  if (assurance.status !== 'allowed') return null;
  const claims = await supabase.auth.getClaims();
  const proof =
    assurance.proof ??
    (claims.data?.claims?.sub === data.user.id && !claims.error
      ? mfaProofFromVerifiedClaims(claims.data.claims)
      : null);
  const mfaTransfer = createMfaTransfer(data.user.id, targetApp, proof);
  const result = await supabase.rpc('generate_cross_app_token', {
    p_user_id: data.user.id,
    p_origin_app: originApp,
    p_target_app: targetApp,
    p_expiry_seconds: Math.min(300, Math.max(1, expirySeconds)),
    p_session_data: {
      email: data.user.email ?? null,
      ...(mfaTransfer ? { mfaTransfer } : {}),
    },
  });
  return result.error ? null : result.data;
}
