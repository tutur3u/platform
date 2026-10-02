// @vitest-environment node
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ keys: [] as Record<string, unknown>[] }));
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>();
  return {
    ...actual,
    createRemoteJWKSet:
      () =>
      (
        header: Parameters<ReturnType<typeof actual.createLocalJWKSet>>[0],
        token: Parameters<ReturnType<typeof actual.createLocalJWKSet>>[1]
      ) =>
        actual.createLocalJWKSet({ keys: state.keys })(header, token),
  };
});

import {
  completeAuthorization,
  createAuthorization,
  refreshRegistration,
  validateCallback,
} from './oauth';

let key: Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async () => {
  key = await generateKeyPair('RS256');
  state.keys = [
    { ...(await exportJWK(key.publicKey)), kid: 'test-key', alg: 'RS256' },
  ];
});
afterEach(() => vi.unstubAllGlobals());
const host = 'urn:uuid:11111111-1111-4111-8111-111111111111';
const callback = 'http://127.0.0.1:1455/auth/callback';

describe('ChatGPT OAuth public client', () => {
  it('uses dynamic registration only initially and fresh PKCE/state/nonce per attempt', () => {
    const first = createAuthorization(host, callback);
    expect(first.url.searchParams.get('client_id')).toBe(
      'dynamic_agent_client'
    );
    expect(first.url.searchParams.get('resource')).toBe(
      'https://api.openai.com/v1'
    );
    expect(first.url.searchParams.get('code_challenge_method')).toBe('S256');
    const saved = createAuthorization(host, callback, {
      clientId: 'oaiapp_saved',
      subject: 'synthetic-subject',
      scopes: [],
    });
    expect(saved.url.searchParams.get('agent_name_hint')).toBeNull();
    expect(saved.state).not.toBe(first.state);
    expect(saved.nonce).not.toBe(first.nonce);
  });
  it('rejects state mismatch, missing issued client ID, and account registration substitution', () => {
    const attempt = createAuthorization(host, callback);
    expect(() =>
      validateCallback(new URL(`${callback}?state=wrong&code=example`), attempt)
    ).toThrow('state');
    expect(() =>
      validateCallback(
        new URL(`${callback}?state=${attempt.state}&code=example`),
        attempt
      )
    ).toThrow('registration');
    const saved = createAuthorization(host, callback, {
      clientId: 'oaiapp_saved',
      subject: 'synthetic',
      scopes: [],
    });
    expect(() =>
      validateCallback(
        new URL(
          `${callback}?state=${saved.state}&code=example&client_id=oaiapp_other`
        ),
        saved
      )
    ).toThrow();
  });
  it.each([
    'valid',
    'wrong-nonce',
    'wrong-audience',
    'expired',
    'wrong-issuer',
    'no-plan-scope',
  ])('verifies actual JWT signatures and claims: %s', async (variant) => {
    const attempt = createAuthorization(host, callback);
    const idToken = await new SignJWT({
      nonce: variant === 'wrong-nonce' ? 'wrong' : attempt.nonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setSubject('synthetic-subject')
      .setIssuer(
        variant === 'wrong-issuer'
          ? 'https://invalid.example'
          : 'https://auth.openai.com'
      )
      .setAudience(
        variant === 'wrong-audience' ? 'oaiapp_other' : 'oaiapp_test'
      )
      .setIssuedAt()
      .setExpirationTime(
        variant === 'expired' ? Math.floor(Date.now() / 1000) - 60 : '5m'
      )
      .sign(key.privateKey);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          access_token: 'synthetic-access',
          refresh_token: 'synthetic-refresh',
          id_token: idToken,
          token_type: 'Bearer',
          expires_in: 3600,
          scope:
            variant === 'no-plan-scope'
              ? 'openid'
              : 'openid chatgpt.tokens.use.direct',
        })
      )
    );
    const result = completeAuthorization(
      new URL(
        `${callback}?state=${attempt.state}&code=example&client_id=oaiapp_test`
      ),
      attempt
    );
    if (variant === 'valid')
      expect((await result).subject).toBe('synthetic-subject');
    else await expect(result).rejects.toThrow();
  });
  it('refreshes with the issued client and atomically replaces rotating tokens', async () => {
    const registration = {
      clientId: 'oaiapp_test',
      subject: 'synthetic-subject',
      accessToken: 'synthetic-old',
      refreshToken: 'synthetic-old-refresh',
      scopes: ['chatgpt.tokens.use.direct'],
      expiresAt: 0,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        access_token: 'synthetic-new',
        refresh_token: 'synthetic-new-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'chatgpt.tokens.use.direct',
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    await refreshRegistration(registration);
    expect(registration.refreshToken).toBe('synthetic-new-refresh');
    expect(String(fetchMock.mock.calls[0]?.[1].body)).toContain(
      'client_id=oaiapp_test'
    );
    expect(String(fetchMock.mock.calls[0]?.[1].body)).not.toContain('scope=');
  });
});
