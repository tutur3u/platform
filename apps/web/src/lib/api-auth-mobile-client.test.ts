// @vitest-environment node
import { createAppCoordinationToken } from '@tuturuuu/utils/app-coordination-token';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMobileClientCredential,
  MOBILE_CLIENT_HEADER,
  MOBILE_CLIENT_SCOPE,
} from './auth/mobile-client-credential';

/**
 * End-to-end through withSessionAuth with the real reputation decision and
 * the real Turnstile step-up: only storage, Supabase auth and rate limits are
 * faked. Regression for #8453 (native Dart mutations got 403).
 */
const mocks = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    from: () => ({
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      insert: vi.fn(async () => ({ error: null })),
      limit: vi.fn(async () => ({ data: [], error: null })),
      order: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
    }),
    rpc: mocks.adminRpc,
  })),
  createClient: vi.fn(async () => ({ auth: {} })),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));
vi.mock('@tuturuuu/utils/abuse-protection', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isIPBlocked: vi.fn(async () => null),
  recordApiAuthFailure: vi.fn(),
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge-trust', () => ({
  writeTrustCacheForSubjects: vi.fn(),
  writeVerifiedSessionCacheForSubjects: vi.fn(),
}));
vi.mock('@tuturuuu/utils/abuse-protection/user-suspension', () => ({
  checkUserSuspension: vi.fn(async () => ({ suspended: false })),
}));
vi.mock('./infrastructure/log-drain', () => ({
  setLogDrainUserContext: vi.fn(),
}));
vi.mock('./rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, headers: {} })),
}));

import { withSessionAuth } from './api-auth';

const USER = { created_at: '2026-01-01T00:00:00.000Z', id: 'user-1' };
const b64 = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
// Unsigned (`.sig`) bearers with a mocked session-user lookup are
// representative: in production, Supabase (getClaims/getUser) validates this
// exact Authorization bearer before withSessionAuth reads `session_id` from
// it, and the reader also requires the payload `sub` to equal the user that
// validation returned. A forged bearer never reaches the credential check,
// because it fails authentication first (401).
const supabaseJwt = (sub: string, sessionId: string) =>
  `${b64({ alg: 'HS256' })}.${b64({ session_id: sessionId, sub })}.sig`;
const credential = (userId = USER.id, sessionId = 'sess-1') =>
  createMobileClientCredential({ sessionId, userId }).token;

function nativeMutation(headers: Record<string, string> = {}) {
  return new NextRequest('https://tuturuuu.com/api/v1/users/me/tasks', {
    body: '{}',
    headers: {
      authorization: `Bearer ${supabaseJwt(USER.id, 'sess-1')}`,
      'user-agent': 'Dart/3.14 (dart:io)',
      ...headers,
    },
    method: 'POST',
  });
}

describe('withSessionAuth native mobile client credential', () => {
  const handler = vi.fn(() => NextResponse.json({ ok: true }));
  const route = withSessionAuth(handler, { rateLimit: false });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminRpc.mockResolvedValue({ data: [], error: null });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: USER,
    });
  });

  it('allows a native UA mutation carrying the verified credential', async () => {
    const response = await route(
      nativeMutation({ [MOBILE_CLIENT_HEADER]: credential() })
    );
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('still challenges the same native UA with a plain bearer', async () => {
    const response = await route(nativeMutation());
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('ABUSE_CHALLENGE_REQUIRED');
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ['another user', () => credential('user-2')],
    ['another Supabase session', () => credential(USER.id, 'sess-2')],
    ['a tampered signature', () => `${credential().slice(0, -2)}xx`],
    [
      'an unsigned forged origin_app',
      () =>
        `ttr_${b64({ alg: 'none' })}.${b64({ origin_app: 'mobile', scopes: [MOBILE_CLIENT_SCOPE], sub: USER.id })}.`,
    ],
    [
      'a signed token with mobile origin but the wrong scopes',
      () =>
        createAppCoordinationToken({
          originApp: 'mobile',
          scopes: [MOBILE_CLIENT_SCOPE],
          targetApp: 'platform',
          userId: USER.id,
        }).token,
    ],
    ['a UA-style claim instead of a token', () => 'mobile'],
  ])('still challenges a credential for %s', async (_label, token) => {
    const response = await route(
      nativeMutation({ [MOBILE_CLIENT_HEADER]: token() })
    );
    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('still challenges a valid credential on a scripted UA', async () => {
    const response = await route(
      nativeMutation({
        [MOBILE_CLIENT_HEADER]: credential(),
        'user-agent': 'curl/8.7.1',
      })
    );
    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps an explicit server challenge over a valid credential', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: [
        {
          decision_source: 'override',
          tier: 'challenge_required',
          trust_multiplier: 1,
        },
      ],
      error: null,
    });
    const response = await route(
      nativeMutation({ [MOBILE_CLIENT_HEADER]: credential() })
    );
    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores the credential when the bearer belongs to someone else', async () => {
    const response = await route(
      nativeMutation({
        authorization: `Bearer ${supabaseJwt('user-2', 'sess-1')}`,
        [MOBILE_CLIENT_HEADER]: credential(),
      })
    );
    expect(response.status).toBe(403);
  });
});
