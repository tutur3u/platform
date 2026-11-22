// @vitest-environment node
import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMobileClientCredential,
  issueMobileClientCredentialForSession,
  mobileClientSessionBinding,
  MOBILE_CLIENT_TTL_SECONDS,
  readSupabaseSessionId,
  verifyMobileClientCredential,
} from './mobile-client-credential';
import {
  MOBILE_CLIENT_TURNSTILE_ACTION,
  mintMobileClientCredential,
  mobileClientAuthFailureResponse,
} from './mobile-client-credential-mint';

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
  const user = { email: 'user@example.com', id: 'user-1' } as never;
  const bearer = `Bearer ${jwt({ session_id: 'sess-1', sub: 'user-1' })}`;
  const validSolve = {
    action: MOBILE_CLIENT_TURNSTILE_ACTION,
    cdata: mobileClientSessionBinding('sess-1'),
    hostname: 'tuturuuu.com',
    success: true,
  };
  const request = (
    headers: Record<string, string> = {},
    body: unknown = { captchaToken: 'turnstile-token' }
  ) =>
    new NextRequest(
      'https://tuturuuu.com/api/v1/auth/mobile/client-credential',
      {
        body: JSON.stringify(body),
        headers: { authorization: bearer, ...headers },
        method: 'POST',
      }
    );
  const deps = (
    siteverify: Record<string, unknown> = validSolve,
    overrides = {}
  ) => ({
    guardIp: vi.fn(async () => null),
    rateLimit: vi.fn(async () => null),
    recordAuthFailure: vi.fn(),
    resolveUser: vi.fn(async () => ({ ok: true as const, user })),
    turnstileFetch: vi.fn(
      async () => new Response(JSON.stringify(siteverify))
    ) as unknown as typeof fetch,
    turnstileHostname: () => 'tuturuuu.com',
    ...overrides,
  });

  beforeEach(() => vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret'));
  afterEach(() => vi.unstubAllEnvs());

  it('mints a bound credential without an email claim after a purpose-bound Turnstile pass', async () => {
    const d = deps();
    const response = await mintMobileClientCredential(request(), d);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(d.turnstileFetch).toHaveBeenCalledOnce();
    expect(
      verifyMobileClientCredential(body.mobile_client.token, binding)
    ).toBe(true);
    expect(
      verifyMobileClientCredential(body.mobile_client.token, {
        ...binding,
        requireMastermindSession: true,
      })
    ).toBe(false);
    const payload = JSON.parse(
      Buffer.from(body.mobile_client.token.split('.')[1], 'base64url').toString(
        'utf8'
      )
    );
    expect(payload.email).toBeNull();
    expect(JSON.stringify(payload)).not.toContain('user@example.com');
  });

  it('requires recorded session provenance to mint a Mastermind credential', async () => {
    const refreshMastermindSession = vi.fn(async () => true);
    const response = await mintMobileClientCredential(request(), {
      ...deps(),
      refreshMastermindSession,
    });
    expect(response.status).toBe(200);
    expect(refreshMastermindSession).toHaveBeenCalledWith(binding);
    expect(
      verifyMobileClientCredential(
        (await response.json()).mobile_client.token,
        {
          ...binding,
          requireMastermindSession: true,
        }
      )
    ).toBe(true);
  });

  it.each([
    ['a different action', { ...validSolve, action: 'login' }],
    ['a different hostname', { ...validSolve, hostname: 'evil.example' }],
    [
      'another session binding',
      { ...validSolve, cdata: mobileClientSessionBinding('sess-2') },
    ],
    ['no cdata', { ...validSolve, cdata: undefined }],
    ['a failed solve', { ...validSolve, success: false }],
  ])('rejects a Turnstile solve with %s', async (_label, siteverify) => {
    const response = await mintMobileClientCredential(
      request(),
      deps(siteverify)
    );
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty('mobile_client');
  });

  it('refuses browser requests before any other check', async () => {
    const d = deps();
    const response = await mintMobileClientCredential(
      request({ origin: 'https://tuturuuu.com' }),
      d
    );
    expect(response.status).toBe(403);
    expect(d.guardIp).not.toHaveBeenCalled();
    expect(d.resolveUser).not.toHaveBeenCalled();
  });

  it('checks the IP guard before resolving the user', async () => {
    const blocked = NextResponse.json({}, { status: 429 });
    const d = deps(validSolve, { guardIp: vi.fn(async () => blocked) });
    expect((await mintMobileClientCredential(request(), d)).status).toBe(429);
    expect(d.resolveUser).not.toHaveBeenCalled();
  });

  it('rejects a missing captcha token', async () => {
    const response = await mintMobileClientCredential(request({}, {}), deps());
    expect(response.status).toBe(400);
  });

  it('records an auth failure for a bearer not bound to the user', async () => {
    const d = deps();
    const response = await mintMobileClientCredential(
      request({
        authorization: `Bearer ${jwt({ session_id: 's', sub: 'x' })}`,
      }),
      d
    );
    expect(response.status).toBe(401);
    expect(d.recordAuthFailure).toHaveBeenCalledOnce();
  });

  it('records auth failures and honors the user rate limit', async () => {
    const unauthorized = NextResponse.json({}, { status: 401 });
    const failed = deps(validSolve, {
      resolveUser: vi.fn(async () => ({ ok: false, response: unauthorized })),
    });
    expect((await mintMobileClientCredential(request(), failed)).status).toBe(
      401
    );
    expect(failed.recordAuthFailure).toHaveBeenCalledOnce();
    expect(mobileClientAuthFailureResponse({ status: 401 }).status).toBe(401);
    expect(mobileClientAuthFailureResponse(null).status).toBe(401);
    for (const authError of [{ status: 429 }, { status: 503 }, { status: 0 }]) {
      const response = mobileClientAuthFailureResponse(authError);
      expect(response.status).toBe(503);
      const unavailable = deps(validSolve, {
        resolveUser: vi.fn(async () => ({ ok: false, response })),
      });
      expect(
        (await mintMobileClientCredential(request(), unavailable)).status
      ).toBe(503);
      expect(unavailable.recordAuthFailure).not.toHaveBeenCalled();
    }
    const limited = NextResponse.json({}, { status: 429 });
    const d = deps(validSolve, { rateLimit: vi.fn(async () => limited) });
    expect((await mintMobileClientCredential(request(), d)).status).toBe(429);
    expect(d.turnstileFetch).not.toHaveBeenCalled();
  });
});
