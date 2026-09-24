import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { verifyAppCoordinationToken } from './app-coordination-token';
import { bindCurrentMfaFactor } from './required-mfa-lineage';
import {
  isMfaSessionProof,
  type MfaSessionProof,
  mfaProofFromVerifiedClaims,
  readRequiredMfaPolicy,
  requiresFreshPrimaryForMfa,
  satisfiesRequiredMfaPolicy,
} from './required-mfa-policy';

type RequestLike = Pick<Request, 'headers'> & Partial<Pick<Request, 'url'>>;
export type AccountAssuranceResult =
  | { status: 'allowed'; userId: string; proof: MfaSessionProof | null }
  | { status: 'required'; userId: string }
  | { status: 'unavailable' }
  | { status: 'invalid' };

export interface AccountAssuranceDependencies {
  createUserClient(request: RequestLike): Promise<TypedSupabaseClient>;
  createAdminClient(): Promise<TypedSupabaseClient>;
  nowSeconds(): number;
}

/** Enforces fresh server-owned policy, never user metadata or unverified JWTs.
 * Authentication/authorization remains the responsibility of each route.
 * This helper intentionally has no policy cache: recovery takes effect on the
 * next request, including for an already-issued app access/refresh token.
 */
export async function checkRequiredAccountMfa(
  request: RequestLike,
  dependencies: AccountAssuranceDependencies,
  /** Bind to the principal resolved by the route, using its selected credential.
   * Never approve one cookie while the route authorizes another identity. */
  principal: { userId: string; appToken?: string }
): Promise<AccountAssuranceResult> {
  try {
    const token = principal.appToken;
    let user: SupabaseUser;
    let proof: MfaSessionProof | null;
    let sessionId: string | undefined;
    let admin: TypedSupabaseClient | undefined;
    const now = dependencies.nowSeconds();
    if (token) {
      const verification = verifyAppCoordinationToken(token);
      if (!verification.ok) return { status: 'invalid' };
      admin = await dependencies.createAdminClient();
      const result = await admin.auth.admin.getUserById(
        verification.claims.sub
      );
      if (result.error || !result.data.user) return { status: 'unavailable' };
      user = result.data.user;
      if (user.id !== verification.claims.sub || user.id !== principal.userId) {
        return { status: 'invalid' };
      }
      proof = verification.claims.mfa ?? null;
      sessionId = proof?.sessionId;
    } else {
      const client = await dependencies.createUserClient(request);
      const result = await client.auth.getUser();
      if (result.error || !result.data.user) return { status: 'invalid' };
      user = result.data.user;
      if (user.id !== principal.userId) return { status: 'invalid' };
      if (user.banned_until && Date.parse(user.banned_until) / 1000 > now)
        return { status: 'invalid' };
      // No extra claims request is needed for accounts without the policy.
      if (!readRequiredMfaPolicy(user.app_metadata).required) {
        return { status: 'allowed', userId: user.id, proof: null };
      }
      const claims = await client.auth.getClaims();
      if (claims.error || claims.data?.claims?.sub !== user.id) {
        return { status: 'invalid' };
      }
      if (requiresFreshPrimaryForMfa(user.app_metadata, claims.data.claims))
        return { status: 'required', userId: user.id };
      proof = mfaProofFromVerifiedClaims(claims.data.claims, now);
      sessionId =
        typeof claims.data.claims.session_id === 'string'
          ? claims.data.claims.session_id
          : undefined;
    }
    if (user.banned_until && Date.parse(user.banned_until) / 1000 > now)
      return { status: 'invalid' };
    const policy = readRequiredMfaPolicy(user.app_metadata);
    if (!policy.required) return { status: 'allowed', userId: user.id, proof };
    if (proof && satisfiesRequiredMfaPolicy(policy, proof, now)) {
      admin ??= await dependencies.createAdminClient();
      const bound = await bindCurrentMfaFactor(admin, user.id, proof, !token);
      if (bound) return { status: 'allowed', userId: user.id, proof: bound };
    }
    // A signed app proof is immutable: only its original provider requester
    // may consume a new mobile approval and mint a replacement handoff.
    if (!token && sessionId && Number.isFinite(policy.verifiedAfter)) {
      admin ??= await dependencies.createAdminClient();
      const result = await admin
        .from('qr_login_challenges')
        .select('approved_at, approval_metadata, request_metadata')
        .eq('approver_user_id', user.id)
        .eq('status', 'consumed')
        .eq('request_metadata->>kind', 'mfa_mobile_approval')
        .eq('request_metadata->>requesterSessionId', sessionId)
        .eq('approval_metadata->>approverSessionId', sessionId)
        .not('consumed_at', 'is', null)
        .order('approved_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.error) return { status: 'unavailable' };
      const row = result.data;
      if (row) {
        const approvedAt = Date.parse(row.approved_at ?? '') / 1000;
        const metadata = row.approval_metadata as Record<
          string,
          unknown
        > | null;
        const until = metadata?.mobileMfaValidUntil;
        if (
          Math.floor(approvedAt) > policy.verifiedAfter &&
          approvedAt <= now &&
          typeof until === 'string' &&
          Date.parse(until) / 1000 > now
        ) {
          const source = metadata?.requiredMfaProof;
          if (
            isMfaSessionProof(source) &&
            satisfiesRequiredMfaPolicy(policy, source, now)
          ) {
            const bound = await bindCurrentMfaFactor(admin, user.id, source);
            if (bound)
              return {
                status: 'allowed',
                userId: user.id,
                proof: {
                  ...bound,
                  expiresAt: Math.floor(Date.parse(until) / 1000),
                },
              };
          }
        }
      }
    }
    return { status: 'required', userId: user.id };
  } catch {
    return { status: 'unavailable' };
  }
}
