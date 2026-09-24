/** Server-owned app metadata; never read this policy from user_metadata. */
export const REQUIRED_MFA_POLICY_KEY = 'tuturuuu_required_mfa';

export type RequiredMfaPolicy = {
  required: boolean;
  /** A new policy or recovery reset invalidates earlier MFA proofs. */
  verifiedAfter: number;
  primaryVerifiedAfter?: number;
};

export type MfaSessionProof = {
  sessionId: string;
  verifiedAt: number;
  factorId?: string;
  verificationSessionId?: string;
  primaryVerifiedAt?: number;
  /** Mobile approval remains time-bounded across access/refresh tokens. */
  expiresAt?: number;
};

/** Validate proof carried by a verified, server-signed app session. */
export function isMfaSessionProof(value: unknown): value is MfaSessionProof {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proof = value as Record<string, unknown>;
  return (
    typeof proof.sessionId === 'string' &&
    proof.sessionId.length > 0 &&
    typeof proof.verifiedAt === 'number' &&
    Number.isSafeInteger(proof.verifiedAt) &&
    proof.verifiedAt >= 0 &&
    (proof.factorId === undefined || typeof proof.factorId === 'string') &&
    (proof.verificationSessionId === undefined ||
      typeof proof.verificationSessionId === 'string') &&
    (proof.primaryVerifiedAt === undefined ||
      (typeof proof.primaryVerifiedAt === 'number' &&
        Number.isSafeInteger(proof.primaryVerifiedAt) &&
        proof.primaryVerifiedAt >= 0)) &&
    (proof.expiresAt === undefined ||
      (typeof proof.expiresAt === 'number' &&
        Number.isSafeInteger(proof.expiresAt) &&
        proof.expiresAt > proof.verifiedAt))
  );
}

/** Missing policy preserves existing accounts; malformed policy fails closed. */
export function readRequiredMfaPolicy(
  appMetadata: Record<string, unknown> | null | undefined
): RequiredMfaPolicy {
  if (!appMetadata || !Object.hasOwn(appMetadata, REQUIRED_MFA_POLICY_KEY)) {
    return { required: false, verifiedAfter: 0 };
  }
  const raw = appMetadata[REQUIRED_MFA_POLICY_KEY];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { required: true, verifiedAfter: Number.POSITIVE_INFINITY };
  }
  const policy = raw as Record<string, unknown>;
  if (policy.required === false) return { required: false, verifiedAfter: 0 };
  const verifiedAfter =
    Object.hasOwn(policy, 'recoveryInProgress') &&
    policy.recoveryInProgress !== false
      ? null
      : policy.verifiedAfter;
  const primary = policy.primaryVerifiedAfter;
  return {
    required: true,
    ...(primary === undefined
      ? {}
      : {
          primaryVerifiedAfter:
            typeof primary === 'number' &&
            Number.isSafeInteger(primary) &&
            primary >= 0
              ? primary
              : Number.POSITIVE_INFINITY,
        }),
    verifiedAfter:
      policy.required === true &&
      typeof verifiedAfter === 'number' &&
      Number.isSafeInteger(verifiedAfter) &&
      verifiedAfter >= 0
        ? verifiedAfter
        : Number.POSITIVE_INFINITY,
  };
}

/** Call only with cryptographically verified Supabase claims. Token iat alone
 * is not MFA evidence: a refresh must not turn an old proof into a new one. */
export function mfaProofFromVerifiedClaims(
  claims: Record<string, unknown>,
  nowSeconds = Math.floor(Date.now() / 1000)
): MfaSessionProof | null {
  if (
    claims.aal !== 'aal2' ||
    typeof claims.session_id !== 'string' ||
    !claims.session_id ||
    !Array.isArray(claims.amr)
  ) {
    return null;
  }
  const verifiedAt = claims.amr.reduce<number>((latest, raw) => {
    if (!raw || typeof raw !== 'object') return latest;
    const entry = raw as Record<string, unknown>;
    const timestamp = entry.timestamp;
    if (
      !['totp', 'mfa/phone', 'mfa/webauthn', 'mfa/recovery_code'].includes(
        typeof entry.method === 'string' ? entry.method : ''
      ) ||
      typeof timestamp !== 'number' ||
      !Number.isSafeInteger(timestamp) ||
      timestamp < 0 ||
      timestamp > nowSeconds
    ) {
      return latest;
    }
    return Math.max(latest, timestamp);
  }, -1);
  const primaryVerifiedAt = primaryProofTime(claims, nowSeconds);
  return verifiedAt < 0
    ? null
    : {
        sessionId: claims.session_id,
        verifiedAt,
        ...(primaryVerifiedAt === null ? {} : { primaryVerifiedAt }),
      };
}

export function satisfiesRequiredMfaPolicy(
  policy: RequiredMfaPolicy,
  proof: MfaSessionProof | null,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  if (!policy.required) return true;
  return Boolean(
    isMfaSessionProof(proof) &&
      proof.verifiedAt > policy.verifiedAfter &&
      proof.verifiedAt <= nowSeconds &&
      (policy.primaryVerifiedAfter === undefined ||
        (proof.primaryVerifiedAt !== undefined &&
          proof.primaryVerifiedAt > policy.primaryVerifiedAfter &&
          proof.primaryVerifiedAt <= nowSeconds)) &&
      (proof.expiresAt === undefined || proof.expiresAt > nowSeconds)
  );
}

/** Refresh is never a new primary authentication. */
export function primaryProofTime(
  claims: Record<string, unknown>,
  now = Math.floor(Date.now() / 1000)
): number | null {
  if (!Array.isArray(claims.amr)) return null;
  const methods = new Set([
    'password',
    'otp',
    'oauth',
    'sso/saml',
    'sso',
    'magiclink',
    'recovery',
    'invite',
    'passkey',
    'web3',
    'email/signup',
    'phone/signup',
  ]);
  const times = claims.amr.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const value = entry as Record<string, unknown>;
    return methods.has(String(value.method)) &&
      typeof value.timestamp === 'number' &&
      Number.isSafeInteger(value.timestamp) &&
      value.timestamp >= 0 &&
      value.timestamp <= now
      ? [value.timestamp]
      : [];
  });
  return times.length ? Math.max(...times) : null;
}
export function requiresFreshPrimaryForMfa(
  metadata: Record<string, unknown> | null | undefined,
  claims: Record<string, unknown>
) {
  const policy = readRequiredMfaPolicy(metadata);
  return (
    policy.required &&
    policy.primaryVerifiedAfter !== undefined &&
    (primaryProofTime(claims) ?? -1) <= policy.primaryVerifiedAfter
  );
}
