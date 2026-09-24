import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { MfaSessionProof } from './required-mfa-policy';

/** The provider JWT does not contain factor_id. Resolve its verified session
 * against current GoTrue factor state; signed handoffs retain that exact id. */
export async function bindCurrentMfaFactor(
  admin: TypedSupabaseClient,
  userId: string,
  proof: MfaSessionProof,
  allowInitialBinding = false
): Promise<MfaSessionProof | null> {
  if (!proof.factorId && !allowInitialBinding) return null;
  const { data, error } = await admin.rpc('account_mfa_verified_factor', {
    p_user_id: userId,
    p_session_id: proof.verificationSessionId ?? proof.sessionId,
    p_verified_at: proof.verifiedAt,
    p_primary_verified_at: proof.primaryVerifiedAt,
  });
  if (error) throw new Error('Account factor verification unavailable');
  if (!data || (proof.factorId && data !== proof.factorId)) return null;
  return { ...proof, factorId: data };
}
