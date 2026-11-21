// @vitest-environment node
import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import {
  createMobileClientCredential,
  issueMobileClientCredentialForSession,
  MOBILE_CLIENT_TTL_SECONDS,
  readSupabaseSessionId,
  verifyMobileClientCredential,
} from './mobile-client-credential';
import { mintMobileClientCredential } from './mobile-client-credential-mint';

const b64 = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (payload: object) => `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
const binding = { sessionId: 'sess-1', userId: 'user-1' };

describe('mobile client credential', () => {
  it('verifies only for the bound user and Supabase session', () => {
    const { token } = createMobileClientCredential(binding);
    expect(verifyMobileClientCredential(token, binding)).toBe(true);
    expect(
      verifyMobileClientCredential(token, { ...binding, userId: 'user-2' })
    ).toBe(false);
    expect(
      verifyMobileClientCredential(token, { ...binding, sessionId: 'sess-2' })
    ).toBe(false);
    expect(
      verifyMobileClientCredential(token, { ...binding, sessionId: null })
    ).toBe(false);
  });

  it('expires after its TTL', () => {
    const now = new Date('2026-11-21T00:00:00.000Z');
    const { token } = createMobileClientCredential(binding, { now });
    const later = new Date(now.getTime() + MOBILE_CLIENT_TTL_SECONDS * 1000);
    expect(verifyMobileClientCredential(token, binding, { now })).toBe(true);
    expect(verifyMobileClientCredential(token, binding, { now: later })).toBe(
      false
    );
  });

  it('refuses app-session and CLI tokens for the same user', () => {
    const appSession = createAppSessionToken({
      originApp: 'mobile',
      targetApp: 'platform',
      userId: 'user-1',
    }).token;
    const cli = createCliAppSession({ userId: 'user-1' });
    for (const token of [appSession, cli.access.token, cli.refresh.token]) {
      expect(verifyMobileClientCredential(token, binding)).toBe(false);
    }
  });

  it('reads session_id only when the bearer subject matches', () => {
    const token = jwt({ session_id: 'sess-1', sub: 'user-1' });
    expect(readSupabaseSessionId(token, 'user-1')).toBe('sess-1');
    expect(readSupabaseSessionId(token, 'user-2')).toBeNull();
    expect(readSupabaseSessionId('not-a-jwt', 'user-1')).toBeNull();
    expect(readSupabaseSessionId(jwt({ sub: 'user-1' }), 'user-1')).toBeNull();
  });

  it('issues a bound credential for a session a mobile sign-in created', () => {
    const issued = issueMobileClientCredentialForSession(
      { access_token: jwt({ session_id: 'sess-1', sub: 'user-1' }) },
      { id: 'user-1' }
    );
    expect(issued && verifyMobileClientCredential(issued.token, binding)).toBe(
      true
    );
    expect(
      issueMobileClientCredentialForSession(
        { access_token: jwt({ session_id: 'sess-1', sub: 'user-2' }) },
        { id: 'user-1' }
      )
    ).toBeUndefined();
  });
});

describe('mintMobileClientCredential', () => {
  const user = { email: null, id: 'user-1' } as never;
  const bearer = `Bearer ${jwt({ session_id: 'sess-1', sub: 'user-1' })}`;
  const request = (
    headers: Record<string, string> = {},
    body: unknown = {
      captchaToken: 'turnstile-token',
    }
  ) =>
    new NextRequest(
      'https://tuturuuu.com/api/v1/auth/mobile/client-credential',
      {
        body: JSON.stringify(body),
        headers: { authorization: bearer, ...headers },
        method: 'POST',
      }
    );
  const deps = (overrides = {}) => ({
    rateLimit: vi.fn(async () => null),
    resolveUser: vi.fn(async () => ({ ok: true as const, user })),
    verifyTurnstile: vi.fn(async () => undefined),
    ...overrides,
  });

  it('mints a bound credential after a Turnstile pass', async () => {
    const d = deps();
    const response = await mintMobileClientCredential(request(), d);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(d.verifyTurnstile).toHaveBeenCalledWith(
      expect.anything(),
      'turnstile-token'
    );
    expect(
      verifyMobileClientCredential(body.mobile_client.token, binding)
    ).toBe(true);
  });

  it('refuses browser requests before authenticating', async () => {
    const d = deps();
    const response = await mintMobileClientCredential(
      request({ origin: 'https://tuturuuu.com' }),
      d
    );
    expect(response.status).toBe(403);
    expect(d.resolveUser).not.toHaveBeenCalled();
  });

  it('requires a fresh Turnstile pass', async () => {
    const failed = deps({
      verifyTurnstile: vi.fn(async () => {
        throw new Error('invalid');
      }),
    });
    expect((await mintMobileClientCredential(request(), failed)).status).toBe(
      403
    );
    expect(
      (await mintMobileClientCredential(request({}, {}), deps())).status
    ).toBe(400);
  });

  it('requires a Supabase bearer bound to the authenticated user', async () => {
    const response = await mintMobileClientCredential(
      request({
        authorization: `Bearer ${jwt({ session_id: 's', sub: 'x' })}`,
      }),
      deps()
    );
    expect(response.status).toBe(401);
  });

  it('honors auth failures and rate limits', async () => {
    const unauthorized = NextResponse.json({}, { status: 401 });
    expect(
      (
        await mintMobileClientCredential(
          request(),
          deps({
            resolveUser: vi.fn(async () => ({
              ok: false,
              response: unauthorized,
            })),
          })
        )
      ).status
    ).toBe(401);
    const limited = NextResponse.json({}, { status: 429 });
    const d = deps({ rateLimit: vi.fn(async () => limited) });
    expect((await mintMobileClientCredential(request(), d)).status).toBe(429);
    expect(d.verifyTurnstile).not.toHaveBeenCalled();
  });
});
