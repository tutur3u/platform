import { verifyCliAccessToken } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { AppCoordinationTokenClaims } from '@tuturuuu/utils/app-coordination-token';
import { bindCurrentMfaFactor } from '@tuturuuu/utils/required-mfa-lineage';
import { isMfaSessionProof } from '@tuturuuu/utils/required-mfa-policy';
import { checkRateLimitRedis } from '@/lib/rate-limit';

/** Exactly "true" enables CLI employee creation; anything else keeps it closed. */
export const EMPLOYEE_CREATION_CLI_FLAG = 'EMPLOYEE_CREATION_CLI_ENABLED';
export const EMPLOYEE_CREATION_CLI_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
} as const;

export function isEmployeeCreationCliEnabled() {
  return process.env[EMPLOYEE_CREATION_CLI_FLAG] === 'true';
}

/**
 * Signed claims of a verified `ttr login` access token (origin_app `cli`), or
 * null for every other credential and whenever the flag is off. A null result
 * leaves the request on the unchanged infra session path, which refuses CLI
 * tokens. Throws only when token verification itself is unavailable.
 */
export function employeeCreationCliClaims(
  request: Request
): AppCoordinationTokenClaims | null {
  if (!isEmployeeCreationCliEnabled()) return null;
  const bearer = request.headers
    .get('authorization')
    ?.match(/^Bearer (\S+)$/i)?.[1];
  if (!bearer) return null;
  const verified = verifyCliAccessToken(bearer);
  return verified.ok && verified.claims.origin_app === 'cli'
    ? verified.claims
    : null;
}

/**
 * CLI employee creation always needs an MFA proof bound into the token at
 * issuance, whatever the operator's required-MFA policy says. The proof must
 * be well formed, unexpired, not from the future, and match a factor the
 * account verified in that session.
 */
export async function hasBoundCliMfaProof(
  claims: AppCoordinationTokenClaims,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  const proof = claims.mfa;
  if (
    !isMfaSessionProof(proof) ||
    proof.verifiedAt > nowSeconds ||
    (proof.expiresAt !== undefined && proof.expiresAt <= nowSeconds)
  )
    return false;
  const admin = await createAdminClient({ noCookie: true });
  return Boolean(await bindCurrentMfaFactor(admin, claims.sub, proof, true));
}

/** 5 creations per hour per actor; refuses when the store cannot answer. */
export async function takeEmployeeCreationCliQuota(actorUserId: string) {
  const result = await checkRateLimitRedis(
    `employee-creation:cli:${actorUserId}`,
    EMPLOYEE_CREATION_CLI_RATE_LIMIT,
    { failClosed: true }
  );
  return result.allowed
    ? { allowed: true as const }
    : {
        allowed: false as const,
        status: result.unavailable ? (503 as const) : (429 as const),
        retryAfter: Math.max(1, result.reset - Math.floor(Date.now() / 1000)),
      };
}

/** One structured line per CLI create attempt. Never the token or password. */
export function auditEmployeeCreationCli(entry: {
  actorUserId: string;
  tokenId: string;
  targetEmail: string | null;
  operationId: string | null;
  httpStatus: number;
  result: string;
}) {
  const line = { event: 'employee_creation_cli', ...entry };
  if (entry.httpStatus >= 400) console.warn('[employee-creation-cli]', line);
  else console.info('[employee-creation-cli]', line);
}
