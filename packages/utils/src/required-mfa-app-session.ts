import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { AppCoordinationTokenClaims } from './app-coordination-token';
import { bindCurrentMfaFactor } from './required-mfa-lineage';
import {
  type MfaSessionProof,
  readRequiredMfaPolicy,
  satisfiesRequiredMfaPolicy,
} from './required-mfa-policy';

/** Claims must already be signature/scope/target verified by the caller. */
export async function isRequiredMfaAppSessionAllowed(
  claims: AppCoordinationTokenClaims
) {
  return (
    (await resolveRequiredMfaAppSessionAuthority(claims)).status === 'allowed'
  );
}

export function resolveRequiredMfaAppSessionAuthority(
  claims: AppCoordinationTokenClaims,
  options: { now?: Date } = {}
) {
  return resolveRequiredMfaProofAuthority(
    claims.sub,
    claims.mfa ?? null,
    options
  );
}

type RequiredMfaAuthority =
  | { status: 'denied' }
  | { status: 'allowed'; required: false }
  | { status: 'allowed'; required: true; proof: MfaSessionProof };

export async function isRequiredMfaProofAllowed(
  userId: string,
  proof: MfaSessionProof | null
) {
  return (
    (await resolveRequiredMfaProofAuthority(userId, proof)).status === 'allowed'
  );
}

async function resolveRequiredMfaProofAuthority(
  userId: string,
  proof: MfaSessionProof | null,
  options: { now?: Date } = {}
): Promise<RequiredMfaAuthority> {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) throw new Error('Account security is unavailable');
  if (!data.user || data.user.id !== userId) return { status: 'denied' };
  if (
    data.user.banned_until &&
    Date.parse(data.user.banned_until) > (options.now?.getTime() ?? Date.now())
  )
    return { status: 'denied' };
  const policy = readRequiredMfaPolicy(data.user.app_metadata);
  if (!policy.required) return { status: 'allowed', required: false };
  if (
    !proof ||
    !satisfiesRequiredMfaPolicy(
      policy,
      proof,
      Math.floor((options.now?.getTime() ?? Date.now()) / 1000)
    )
  )
    return { status: 'denied' };
  const boundProof = await bindCurrentMfaFactor(admin, userId, proof);
  return boundProof
    ? { status: 'allowed', required: true, proof: boundProof }
    : { status: 'denied' };
}
