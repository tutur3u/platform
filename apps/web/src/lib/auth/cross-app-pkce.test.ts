import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  getCrossAppPkceParams,
  matchesRegisteredCallbackPath,
  PKCE_CODE_VERIFIER_PATTERN,
  PKCE_S256_CHALLENGE_PATTERN,
  parseCrossAppPkceChallenge,
} from './cross-app-pkce';

// RFC 7636 appendix B.
const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('cross-app PKCE helpers', () => {
  it('matches the RFC 7636 S256 vector and patterns', () => {
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
      challenge
    );
    expect(PKCE_S256_CHALLENGE_PATTERN.test(challenge)).toBe(true);
    expect(PKCE_CODE_VERIFIER_PATTERN.test(verifier)).toBe(true);
    expect(PKCE_CODE_VERIFIER_PATTERN.test('a'.repeat(42))).toBe(false);
    expect(PKCE_CODE_VERIFIER_PATTERN.test('a'.repeat(129))).toBe(false);
    expect(PKCE_CODE_VERIFIER_PATTERN.test(`${'a'.repeat(42)}+`)).toBe(false);
  });

  it('accepts only a well-formed S256 challenge', () => {
    expect(parseCrossAppPkceChallenge({})).toBeNull();
    expect(
      parseCrossAppPkceChallenge({
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      })
    ).toEqual({ codeChallenge: challenge, codeChallengeMethod: 'S256' });
    expect(
      parseCrossAppPkceChallenge({
        codeChallenge: challenge,
        codeChallengeMethod: 'plain',
      })
    ).toBe(false);
    expect(parseCrossAppPkceChallenge({ codeChallenge: challenge })).toBe(
      false
    );
    expect(parseCrossAppPkceChallenge({ codeChallengeMethod: 'S256' })).toBe(
      false
    );
    expect(
      parseCrossAppPkceChallenge({
        codeChallenge: `${challenge}A`,
        codeChallengeMethod: 'S256',
      })
    ).toBe(false);
    expect(
      parseCrossAppPkceChallenge({
        codeChallenge: `${challenge.slice(0, 42)}=`,
        codeChallengeMethod: 'S256',
      })
    ).toBe(false);
  });

  it('reads the login redirect query parameters', () => {
    expect(
      getCrossAppPkceParams(
        new URLSearchParams(
          `returnUrl=x&code_challenge=${challenge}&code_challenge_method=S256`
        )
      )
    ).toEqual({ codeChallenge: challenge, codeChallengeMethod: 'S256' });
    expect(getCrossAppPkceParams(new URLSearchParams('returnUrl=x'))).toEqual(
      {}
    );
  });

  it('pins return URLs to registered callback paths', () => {
    const url = 'https://fysh.example/auth/callback?state=1';
    expect(matchesRegisteredCallbackPath(url, [])).toBe(true);
    expect(matchesRegisteredCallbackPath(url, ['/auth/callback'])).toBe(true);
    expect(matchesRegisteredCallbackPath(url, ['/auth/callback/'])).toBe(false);
    expect(
      matchesRegisteredCallbackPath('https://fysh.example/steal', [
        '/auth/callback',
      ])
    ).toBe(false);
    expect(
      matchesRegisteredCallbackPath(
        'https://fysh.example/auth/callback/../steal',
        ['/auth/callback']
      )
    ).toBe(false);
    expect(matchesRegisteredCallbackPath('not a url', ['/auth/callback'])).toBe(
      false
    );
  });
});
