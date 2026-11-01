/**
 * RFC 7636 PKCE binding for cross-app login handoffs. An external app sends
 * `code_challenge` + `code_challenge_method=S256` on the login redirect and the
 * matching `codeVerifier` on the app-token exchange; the database refuses a
 * challenge-bound handoff token without it.
 */

/** BASE64URL(SHA256(verifier)) without padding is always 43 characters. */
export const PKCE_S256_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
/** RFC 7636 section 4.1: 43-128 unreserved characters. */
export const PKCE_CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/u;

export type CrossAppPkceChallenge = {
  codeChallenge: string;
  codeChallengeMethod: 'S256';
};

export type CrossAppPkceChallengeInput = {
  codeChallenge?: string | null;
  codeChallengeMethod?: string | null;
};

/** Returns null when no challenge was sent, or `false` when it is invalid. */
export function parseCrossAppPkceChallenge({
  codeChallenge,
  codeChallengeMethod,
}: CrossAppPkceChallengeInput): CrossAppPkceChallenge | null | false {
  if (!codeChallenge && !codeChallengeMethod) return null;
  // Only S256 is supported; RFC 7636 defaults a missing method to `plain`.
  if (
    codeChallengeMethod !== 'S256' ||
    !codeChallenge ||
    !PKCE_S256_CHALLENGE_PATTERN.test(codeChallenge)
  ) {
    return false;
  }

  return { codeChallenge, codeChallengeMethod: 'S256' };
}

/** Reads the login redirect's `code_challenge` query parameters. */
export function getCrossAppPkceParams(
  searchParams: Pick<URLSearchParams, 'get'>
): { codeChallenge?: string; codeChallengeMethod?: string } {
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');

  return {
    ...(codeChallenge ? { codeChallenge } : {}),
    ...(codeChallengeMethod ? { codeChallengeMethod } : {}),
  };
}

/** An empty list keeps the legacy origin-only return URL check. */
export function matchesRegisteredCallbackPath(
  returnUrl: string,
  callbackPaths: string[]
) {
  if (callbackPaths.length === 0) return true;

  try {
    return callbackPaths.includes(new URL(returnUrl).pathname);
  } catch {
    return false;
  }
}
