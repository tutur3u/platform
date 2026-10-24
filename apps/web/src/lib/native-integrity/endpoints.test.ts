// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mode: vi.fn(),
  runtime: vi.fn(),
  auth: vi.fn(),
  mfa: vi.fn(),
  issue: vi.fn(),
  enroll: vi.fn(),
}));
vi.mock('./runtime', () => ({
  nativeIntegrityMode: mocks.mode,
  nativeIntegrityRuntime: mocks.runtime,
}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.auth }));
vi.mock('@tuturuuu/utils/required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: mocks.mfa,
}));

import { nativeIntegrityEndpoint } from './endpoints';

const challenge = {
  purpose: 'request',
  method: 'GET',
  path: '/api/v1/users/calendar-settings',
  bodyHash: 'h'.repeat(43),
};
const request = (body: unknown) =>
  new NextRequest('https://tuturuuu.com/api/v1/native-integrity/challenge', {
    method: 'POST',
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.mode.mockReturnValue('monitor');
  mocks.mfa.mockResolvedValue(null);
  mocks.auth.mockResolvedValue({ ok: true, user: { id: 'verified-actor' } });
  mocks.runtime.mockReturnValue({ issue: mocks.issue, enroll: mocks.enroll });
  mocks.issue.mockResolvedValue({
    mode: 'monitor',
    challengeId: 'challenge',
    requestHash: 'hash',
    expiresAt: 1_800_000_120_000,
  });
});
describe('native integrity challenge/enrollment adapters', () => {
  it('returns off without parsing credentials, issuing state or calling providers', async () => {
    mocks.mode.mockReturnValue('off');
    expect(
      await (await nativeIntegrityEndpoint(request({}), 'challenge')).json()
    ).toEqual({ mode: 'off', verified: false });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.runtime).not.toHaveBeenCalled();
  });
  it('requires verified auth and MFA before issuing a challenge', async () => {
    mocks.mfa.mockResolvedValue(NextResponse.json({}, { status: 403 }));
    expect(
      (await nativeIntegrityEndpoint(request(challenge), 'challenge')).status
    ).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled();
    mocks.mfa.mockResolvedValue(null);
    mocks.auth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({}, { status: 401 }),
    });
    expect(
      (await nativeIntegrityEndpoint(request(challenge), 'challenge')).status
    ).toBe(401);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('injects actor identity, validates route scope and preserves epoch milliseconds', async () => {
    const response = await nativeIntegrityEndpoint(
      request(challenge),
      'challenge'
    );
    expect(mocks.issue).toHaveBeenCalledWith({
      ...challenge,
      actorId: 'verified-actor',
    });
    expect((await response.json()).expiresAt).toBe(1_800_000_120_000);
    await nativeIntegrityEndpoint(
      request({ ...challenge, path: '/api/v1/other' }),
      'challenge'
    );
    expect(mocks.issue).toHaveBeenCalledTimes(1);
  });
  it('does not mark a monitor-allowed enrollment as verified', async () => {
    mocks.enroll.mockResolvedValue({
      mode: 'monitor',
      allowed: true,
      reason: 'invalid-proof',
    });
    const response = await nativeIntegrityEndpoint(
      request({
        keyId: 'key',
        challengeId: 'c'.repeat(32),
        attestation: 'attestation',
      }),
      'enroll'
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      verified: false,
      verdict: 'invalid-proof',
    });
  });
  it('degrades challenge outage in monitor and rate-limits issuance in enforce with diagnostics', async () => {
    mocks.runtime.mockImplementation(() => {
      throw new Error('store unavailable');
    });
    expect(
      (await nativeIntegrityEndpoint(request(challenge), 'challenge')).status
    ).toBe(200);
    mocks.mode.mockReturnValue('enforce');
    mocks.runtime.mockReturnValue({ issue: mocks.issue });
    mocks.issue.mockRejectedValue(
      Object.assign(new Error('quota'), { status: 429 })
    );
    const response = await nativeIntegrityEndpoint(
      request(challenge),
      'challenge'
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('X-RateLimit-Policy')).toBe(
      'native-integrity-challenge'
    );
  });
});
