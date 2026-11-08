/**
 * Supabase authenticator assurance level of a session. Apps must treat a
 * missing level as `aal1`.
 */
export type SessionAssuranceLevel = 'aal1' | 'aal2';

export type SessionAssurance = {
  aal: SessionAssuranceLevel;
  /** Authentication method names from the session's `amr`, e.g. `totp`. */
  amr?: string[];
};

const AMR_METHOD_PATTERN = /^[a-z0-9_/-]{1,32}$/u;
const MAX_AMR_METHODS = 10;

export function isSessionAssuranceLevel(
  value: unknown
): value is SessionAssuranceLevel {
  return value === 'aal1' || value === 'aal2';
}

export function isSessionAmr(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_AMR_METHODS &&
    value.every(
      (method) => typeof method === 'string' && AMR_METHOD_PATTERN.test(method)
    )
  );
}

/** Call only with cryptographically verified Supabase claims. */
export function sessionAssuranceFromVerifiedClaims(
  claims: Record<string, unknown> | null | undefined
): SessionAssurance | null {
  if (!claims || !isSessionAssuranceLevel(claims.aal)) return null;

  const methods = Array.isArray(claims.amr)
    ? claims.amr.flatMap((entry: unknown) => {
        const method =
          typeof entry === 'string'
            ? entry
            : entry && typeof entry === 'object'
              ? (entry as Record<string, unknown>).method
              : null;
        return typeof method === 'string' && AMR_METHOD_PATTERN.test(method)
          ? [method]
          : [];
      })
    : [];
  const amr = [...new Set(methods)].slice(0, MAX_AMR_METHODS);

  return amr.length > 0 ? { aal: claims.aal, amr } : { aal: claims.aal };
}
