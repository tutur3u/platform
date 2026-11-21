import { describe, expect, it } from 'vitest';
import {
  buildOAuthCallbackUrl,
  readForwardableCrossAppPkce,
} from './oauth-callback-url';

const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const EDUFEST_RETURN_URL =
  'https://edufest.ttr.gg/verify-token?state=opaque%26state';

function build(search: Record<string, string>, fallbackReturnUrl?: string) {
  return new URL(
    buildOAuthCallbackUrl({
      callbackOrigin: 'https://tuturuuu.com',
      fallbackReturnUrl,
      searchParams: new URLSearchParams(search),
    })
  );
}

describe('buildOAuthCallbackUrl', () => {
  it('carries an external returnUrl and its S256 challenge through the provider', () => {
    const url = build({
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      provider: 'google',
      returnUrl: EDUFEST_RETURN_URL,
    });

    expect(url.origin).toBe('https://tuturuuu.com');
    expect(url.pathname).toBe('/api/auth/callback');
    expect(url.searchParams.get('returnUrl')).toBe(EDUFEST_RETURN_URL);
    expect(url.searchParams.get('code_challenge')).toBe(CHALLENGE);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.has('provider')).toBe(false);
  });

  it('never forwards a verifier, a plain challenge or unrelated parameters', () => {
    const url = build({
      code_challenge: CHALLENGE,
      code_challenge_method: 'plain',
      code_verifier: 'v'.repeat(43),
      returnUrl: EDUFEST_RETURN_URL,
      targetApp: 'another-app',
    });

    expect([...url.searchParams.keys()]).toEqual(['returnUrl']);
  });

  it('drops a challenge when there is no return target to bind it to', () => {
    const url = build({
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      nextUrl: '/personal',
    });

    expect([...url.searchParams.keys()]).toEqual(['nextUrl']);
  });

  it('drops a challenge for a relative return path', () => {
    const url = build({
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      returnUrl: '/personal',
    });

    expect([...url.searchParams.keys()]).toEqual(['returnUrl']);
  });

  it('uses the managed fallback only without an explicit returnUrl', () => {
    expect(
      build({}, 'https://vc.tuturuuu.com/').searchParams.get('returnUrl')
    ).toBe('https://vc.tuturuuu.com/');
    expect(
      build(
        { returnUrl: EDUFEST_RETURN_URL },
        'https://vc.tuturuuu.com/'
      ).searchParams.get('returnUrl')
    ).toBe(EDUFEST_RETURN_URL);
  });

  it('keeps multi-account mode only for the literal true value', () => {
    expect(
      build({ multiAccount: 'true' }).searchParams.get('multiAccount')
    ).toBe('true');
    expect(build({ multiAccount: '1' }).searchParams.has('multiAccount')).toBe(
      false
    );
  });
});

describe('readForwardableCrossAppPkce', () => {
  it('accepts only a well-formed S256 pair', () => {
    expect(
      readForwardableCrossAppPkce(
        new URLSearchParams({
          code_challenge: CHALLENGE,
          code_challenge_method: 'S256',
        })
      )
    ).toEqual({ codeChallenge: CHALLENGE, codeChallengeMethod: 'S256' });
    expect(
      readForwardableCrossAppPkce(
        new URLSearchParams({ code_challenge: `${CHALLENGE}=` })
      )
    ).toBeNull();
    expect(readForwardableCrossAppPkce(new URLSearchParams())).toBeNull();
  });
});
