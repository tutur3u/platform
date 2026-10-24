import { describe, expect, it, vi } from 'vitest';
import {
  decodeNativeIntegrityProof,
  hashNativeIntegrityBody,
  NativeIntegrityService,
} from './native-integrity';
import type {
  NativeIntegrityChallenge,
  NativeIntegrityKey,
  NativeIntegrityMode,
  NativeIntegrityStore,
} from './native-integrity-types';

function fixture(mode: NativeIntegrityMode = 'enforce', fallback = false) {
  let now = 1000;
  let sequence = 0;
  const challenges = new Map<string, NativeIntegrityChallenge>();
  const keys = new Map<string, NativeIntegrityKey>();
  const key = (actor: string, id: string) => `${actor}:${id}`;
  const store: NativeIntegrityStore = {
    issueChallenge: vi.fn(async (record) => {
      challenges.set(record.id, record);
      return true;
    }),
    consumeChallenge: vi.fn(async (id) => {
      const record = challenges.get(id) ?? null;
      challenges.delete(id);
      return record;
    }),
    getKey: vi.fn(async (actor, id) => keys.get(key(actor, id)) ?? null),
    registerKey: vi.fn(async (actor, id, value) => {
      if (keys.has(key(actor, id))) return false;
      keys.set(key(actor, id), value);
      return true;
    }),
    advanceCounter: vi.fn(async (actor, id, expected, next) => {
      const value = keys.get(key(actor, id));
      if (!value || value.counter !== expected) return false;
      value.counter = next;
      return true;
    }),
  };
  const verifiers = {
    attest: vi.fn(async () => ({
      publicKey: 'fixture-public-key',
      environment: 'production' as const,
      platform: 'ios' as const,
    })),
    assert: vi.fn(async () => 1),
    play: vi.fn(async () => {}),
    turnstile: vi.fn(async () => {}),
  };
  const binding = {
    actorId: 'actor',
    method: 'PATCH' as const,
    path: '/api/v1/users/calendar-settings',
    bodyHash: hashNativeIntegrityBody('{"timezone":"auto"}'),
  };
  const service = new NativeIntegrityService({
    mode,
    store,
    verifiers,
    now: () => now,
    randomBytes: (size) => Buffer.alloc(size, ++sequence),
    allowTurnstile: fallback,
  });
  const issue = async (purpose: 'request' | 'enroll' = 'request') => {
    const result = await service.issue({
      ...binding,
      purpose,
      ...(purpose === 'enroll' ? { keyId: 'key' } : {}),
    });
    if (result.mode === 'off') throw new Error('off');
    return result;
  };
  return {
    service,
    store,
    verifiers,
    binding,
    issue,
    challenges,
    keys,
    setNow: (time: number) => {
      now = time;
    },
  };
}
describe('native integrity challenge and mode service', () => {
  it('off performs no state, provider or nonce work and returns an off-only response', async () => {
    const { service, store, verifiers, binding } = fixture('off');
    expect(await service.issue({ ...binding, purpose: 'request' })).toEqual({
      mode: 'off',
    });
    expect(await service.verify({ ...binding, mechanism: 'none' })).toEqual({
      allowed: true,
      mode: 'off',
      reason: 'off',
    });
    expect(store.issueChallenge).not.toHaveBeenCalled();
    expect(store.consumeChallenge).not.toHaveBeenCalled();
    expect(verifiers.play).not.toHaveBeenCalled();
  });
  it('issues unique 120-second nonces bound to canonical actor, method, path, bytes and purpose', async () => {
    const { issue, store } = fixture();
    const first = await issue();
    const second = await issue();
    expect(first.expiresAt).toBe(121000);
    expect(first.requestHash).toHaveLength(43);
    expect(first.challengeId).not.toBe(second.challengeId);
    expect(first.requestHash).not.toBe(second.requestHash);
    expect(store.issueChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'request' }),
      { limit: 10, windowSeconds: 60 }
    );
  });
  it('enforces issuance quota, rejects invalid paths/body hashes, and requires enrollment key binding', async () => {
    const { service, binding, store } = fixture();
    vi.mocked(store.issueChallenge).mockResolvedValue(false);
    await expect(
      service.issue({ ...binding, purpose: 'request' })
    ).rejects.toMatchObject({ status: 429, reason: 'challenge-quota' });
    await expect(
      service.issue({ ...binding, path: '/api/v1/admin', purpose: 'request' })
    ).rejects.toThrow();
    await expect(
      service.issue({ ...binding, bodyHash: 'wrong', purpose: 'request' })
    ).rejects.toThrow();
    await expect(
      service.issue({ ...binding, purpose: 'enroll' })
    ).rejects.toMatchObject({ status: 400 });
  });
  it('enrolls the actor key once then verifies signature/counter and rejects replay', async () => {
    const f = fixture();
    const enrollment = await f.issue('enroll');
    expect(
      (
        await f.service.enroll({
          actorId: 'actor',
          challengeId: enrollment.challengeId,
          keyId: 'key',
          attestation: 'fixture',
        })
      ).reason
    ).toBe('verified');
    const challenge = await f.issue();
    const input = {
      ...f.binding,
      mechanism: 'app-attest' as const,
      proof: {
        challengeId: challenge.challengeId,
        keyId: 'key',
        assertion: 'fixture',
      },
    };
    expect((await f.service.verify(input)).reason).toBe('verified');
    expect(f.verifiers.assert).toHaveBeenCalledWith({
      assertion: 'fixture',
      publicKey: 'fixture-public-key',
      platform: 'ios',
      counter: 0,
      requestHash: challenge.requestHash,
    });
    expect((await f.service.verify(input)).allowed).toBe(false);
    expect(f.verifiers.assert).toHaveBeenCalledTimes(1);
  });
  it.each(['actorId', 'method', 'path', 'bodyHash'])(
    'rejects mismatched %s without provider work and burns nonce',
    async (field) => {
      const f = fixture();
      const challenge = await f.issue();
      const input = {
        ...f.binding,
        mechanism: 'play-integrity' as const,
        proof: {
          challengeId: challenge.challengeId,
          keyId: 'key',
          token: 'token',
        },
      };
      const changed =
        field === 'actorId'
          ? { ...input, actorId: 'other' }
          : field === 'method'
            ? { ...input, method: 'GET' as const }
            : field === 'path'
              ? { ...input, path: '/api/v1/workspaces/ws/calendar-settings' }
              : { ...input, bodyHash: hashNativeIntegrityBody('other') };
      expect((await f.service.verify(changed)).reason).toBe('binding-mismatch');
      expect(f.verifiers.play).not.toHaveBeenCalled();
      expect((await f.service.verify(input)).allowed).toBe(false);
    }
  );
  it('rejects stale and enrollment challenges on request verification', async () => {
    const f = fixture();
    const stale = await f.issue();
    f.setNow(121000);
    expect(
      (
        await f.service.verify({
          ...f.binding,
          mechanism: 'play-integrity',
          proof: { challengeId: stale.challengeId, token: 'token' },
        })
      ).reason
    ).toBe('expired-challenge');
    const enrollment = await f.issue('enroll');
    expect(
      (
        await f.service.verify({
          ...f.binding,
          mechanism: 'play-integrity',
          proof: { challengeId: enrollment.challengeId, token: 'token' },
        })
      ).reason
    ).toBe('binding-mismatch');
  });
  it('rejects missing keys, regressing counters and concurrent compare-and-swap failure', async () => {
    const f = fixture();
    async function verify() {
      const challenge = await f.issue();
      return f.service.verify({
        ...f.binding,
        mechanism: 'app-attest',
        proof: {
          challengeId: challenge.challengeId,
          keyId: 'key',
          assertion: 'fixture',
        },
      });
    }
    expect((await verify()).reason).toBe('unknown-key');
    f.keys.set('actor:key', {
      actorId: 'actor',
      publicKey: 'key',
      environment: 'production',
      platform: 'ios',
      counter: 1,
    });
    expect((await verify()).reason).toBe('invalid-proof');
    f.verifiers.assert.mockResolvedValue(2);
    vi.mocked(f.store.advanceCounter).mockResolvedValue(false);
    expect((await verify()).reason).toBe('counter-conflict');
  });
  it('does not permit automatic downgrade after primary proof failure', async () => {
    const f = fixture();
    const c = await f.issue();
    expect(
      (
        await f.service.verify({
          ...f.binding,
          mechanism: 'turnstile',
          proof: { challengeId: c.challengeId, token: 'token' },
        })
      ).reason
    ).toBe('fallback-disabled');
    expect(f.verifiers.turnstile).not.toHaveBeenCalled();
    const fallback = fixture('enforce', true);
    const challenge = await fallback.issue();
    expect(
      (
        await fallback.service.verify({
          ...fallback.binding,
          mechanism: 'turnstile',
          proof: { challengeId: challenge.challengeId, token: 'token' },
        })
      ).reason
    ).toBe('verified');
    expect(fallback.verifiers.turnstile).toHaveBeenCalledWith({
      token: 'token',
      requestHash: challenge.requestHash,
    });
  });
  it.each(['monitor', 'enforce'] as const)(
    '%s handles invalid, unavailable providers and unavailable stores safely',
    async (mode) => {
      const f = fixture(mode);
      f.verifiers.play.mockRejectedValue(new Error('sensitive-provider-value'));
      const challenge = await f.issue();
      const failure = await f.service.verify({
        ...f.binding,
        mechanism: 'play-integrity',
        proof: { challengeId: challenge.challengeId, token: 'token' },
      });
      expect(failure).toEqual({
        allowed: mode === 'monitor',
        mode,
        reason: 'invalid-proof',
      });
      vi.mocked(f.store.consumeChallenge).mockRejectedValue(
        new Error('sensitive-store-value')
      );
      const storeFailure = await f.service.verify({
        ...f.binding,
        mechanism: 'play-integrity',
        proof: { challengeId: challenge.challengeId, token: 'token' },
      });
      expect(storeFailure).toEqual({
        allowed: mode === 'monitor',
        mode,
        reason: 'store-unavailable',
      });
    }
  );
  it('bounds and validates the header envelope before state work', () => {
    expect(decodeNativeIntegrityProof('x'.repeat(16385))).toBeNull();
    expect(decodeNativeIntegrityProof('bad!')).toBeNull();
    const proof = { challengeId: 'a'.repeat(32), token: 'token' };
    expect(
      decodeNativeIntegrityProof(
        Buffer.from(JSON.stringify(proof)).toString('base64url')
      )
    ).toEqual(proof);
    expect(
      decodeNativeIntegrityProof(
        Buffer.from(JSON.stringify({ ...proof, injected: true })).toString(
          'base64url'
        )
      )
    ).toBeNull();
  });
});
