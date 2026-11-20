import { describe, expect, it, vi } from 'vitest';
import type { AbuseGuardClient } from '../client';
import { admitPublicRequest } from '../public-admission';

const policy = {
  surface: 'settlement',
  windowMs: 60_000,
  ipLimit: 30,
  challengeAfter: 5,
  subjectLimit: 15,
};
const request = new Request('https://example.test/api/public', {
  headers: { 'x-forwarded-for': '192.0.2.99' },
});
const trustedIp = '2001:db8::1';

function guard(remaining = 25) {
  const hitWindows = vi.fn().mockResolvedValue({ ok: true, remaining });
  const scoped = { hitWindows } as unknown as AbuseGuardClient;
  return { hitWindows, withFairness: vi.fn().mockReturnValue(scoped) };
}

describe('shared public abuse admission', () => {
  it('charges one source before a validated subject and keeps fairness independent of resource', async () => {
    const client = guard();
    const admission = await admitPublicRequest(request, policy, {
      guard: client,
      trustedIp,
    });
    expect(admission.kind).toBe('admitted');
    if (admission.kind !== 'admitted') throw new Error('Expected admission');
    expect(client.withFairness).toHaveBeenCalledExactlyOnceWith({
      source: trustedIp,
    });
    expect(client.hitWindows).toHaveBeenCalledTimes(1);
    expect(client.hitWindows.mock.calls[0]?.[0][0].partition).toBe(
      'settlement:source:2001:0db8:0000:0000::/64'
    );
    expect(await admission.admitVerifiedSubject('arbitrary-token')).toBe(false);
    expect(client.hitWindows).toHaveBeenCalledTimes(1);
    const digest = 'e'.repeat(64);
    expect(await admission.admitVerifiedSubject(digest)).toBe(true);
    expect(client.hitWindows.mock.calls[1]?.[0][0].partition).toBe(
      `settlement:subject:${digest}`
    );
  });

  it('challenges a busy source without opening a subject quota', async () => {
    const client = guard(24);
    const verifyChallenge = vi.fn().mockResolvedValue(false);
    const dependencies = { guard: client, trustedIp, verifyChallenge };
    expect(await admitPublicRequest(request, policy, dependencies)).toEqual({
      kind: 'challenge',
    });
    expect(client.hitWindows).toHaveBeenCalledTimes(1);
    verifyChallenge.mockResolvedValue(true);
    expect((await admitPublicRequest(request, policy, dependencies)).kind).toBe(
      'admitted'
    );
  });

  it('fails closed without an assigned guard, trusted ingress, or healthy store', async () => {
    expect(
      await admitPublicRequest(request, policy, { guard: null, trustedIp })
    ).toEqual({ kind: 'denied' });
    const client = guard();
    expect(
      await admitPublicRequest(request, policy, {
        guard: client,
        trustedIp: 'unknown',
      })
    ).toEqual({ kind: 'denied' });
    expect(client.hitWindows).not.toHaveBeenCalled();
    client.hitWindows.mockRejectedValue(new Error('store offline'));
    expect(
      await admitPublicRequest(request, policy, { guard: client, trustedIp })
    ).toEqual({ kind: 'denied' });
  });
});
