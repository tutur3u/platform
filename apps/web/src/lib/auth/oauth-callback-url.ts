import { parseCrossAppPkceChallenge } from './cross-app-pkce';

/**
 * Login query parameters that must survive an OAuth provider round trip.
 * `returnUrl`, `nextUrl` and `multiAccount` pick the post-sign-in
 * destination; the PKCE challenge binds an external app's cross-app handoff
 * to the browser that started the login. Dropping the challenge makes the
 * handoff fail for a PKCE-bound app and strands the user on Tuturuuu instead
 * of the requesting app.
 *
 * Only the public S256 challenge crosses the round trip. The verifier stays
 * with the requesting app, and every forwarded value is revalidated by the
 * callback and by `POST /api/v1/auth/cross-app-return`.
 */
const DESTINATION_PARAMS = ['returnUrl', 'nextUrl'] as const;

/**
 * Returns the challenge pair when it is a well-formed S256 challenge, and
 * null otherwise, so a `plain` or malformed challenge is never forwarded.
 */
export function readForwardableCrossAppPkce(
  searchParams: Pick<URLSearchParams, 'get'>
) {
  const challenge = parseCrossAppPkceChallenge({
    codeChallenge: searchParams.get('code_challenge'),
    codeChallengeMethod: searchParams.get('code_challenge_method'),
  });

  return challenge || null;
}

/** Copies a valid S256 challenge pair from one query onto `target`. */
export function copyCrossAppPkceParams(
  from: Pick<URLSearchParams, 'get'>,
  target: URL
) {
  const challenge = readForwardableCrossAppPkce(from);

  if (challenge) {
    target.searchParams.set('code_challenge', challenge.codeChallenge);
    target.searchParams.set(
      'code_challenge_method',
      challenge.codeChallengeMethod
    );
  }

  return target;
}

function isAbsoluteHttpUrl(value: string | null) {
  if (!value) return false;

  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** Pure builder for the OAuth `redirectTo` URL; it reads no cookies. */
export function buildOAuthCallbackUrl({
  callbackOrigin,
  fallbackReturnUrl,
  searchParams,
}: {
  callbackOrigin: string;
  /** Used only when the login request carries no `returnUrl`. */
  fallbackReturnUrl?: string | null;
  searchParams: Pick<URLSearchParams, 'get'>;
}) {
  const callbackUrl = new URL('/api/auth/callback', callbackOrigin);

  for (const name of DESTINATION_PARAMS) {
    const value =
      searchParams.get(name) ??
      (name === 'returnUrl' ? fallbackReturnUrl : null);
    if (value) callbackUrl.searchParams.set(name, value);
  }

  if (searchParams.get('multiAccount') === 'true') {
    callbackUrl.searchParams.set('multiAccount', 'true');
  }

  // A challenge only binds a cross-app handoff, so it rides along with an
  // absolute http(s) return target; the callback still checks the registry.
  if (isAbsoluteHttpUrl(callbackUrl.searchParams.get('returnUrl'))) {
    copyCrossAppPkceParams(searchParams, callbackUrl);
  }

  return callbackUrl.toString();
}
