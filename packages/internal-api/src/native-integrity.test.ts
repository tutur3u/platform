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

function fixture(
  mode: NativeIntegrityMode = 'enforce',
  fallback = false,
  unsupported = false
) {
  let now = 1000;
  let sequence = 0;
  const challenges = new Map<string, NativeIntegrityChallenge>();
  const keys = new Map<string, NativeIntegrityKey>();
  const playActors = new Set<string>();
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
    hasNativeCapability: vi.fn(
      async (actor) =>
        playActors.has(actor) ||
        [...keys.values()].some((value) => value.actorId === actor)
    ),
    recordVerifiedPlayCapability: vi.fn(async (actor) => {
      playActors.add(actor);
    }),
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
    turnstileSiteKey: 'public-site-key',
    turnstileUrl: 'https://tuturuuu.com/native-integrity/turnstile',
    allowTurnstile: fallback,
    turnstileActorEligibility: vi.fn(async () =>
      unsupported
        ? ('unsupported-platform' as const)
        : ('native-required' as const)
    ),
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
    playActors,
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
    const fallback = fixture('enforce', true, true);
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
  it.each(['off', 'monitor', 'enforce'] as const)(
    '%s never lets an enrolled Apple actor downgrade to Turnstile',
    async (mode) => {
      const f = fixture(mode, true, true);
      f.keys.set('actor:another-key', {
        actorId: 'actor',
        publicKey: 'key',
        environment: 'production',
        platform: 'macos',
        counter: 0,
      });
      const issued = await f.service.issue({
        ...f.binding,
        purpose: 'request',
      });
      const result = await f.service.verify({
        ...f.binding,
        mechanism: 'turnstile',
        proof:
          issued.mode === 'off'
            ? undefined
            : { challengeId: issued.challengeId, token: 'token' },
      });
      expect(result).toEqual({
        allowed: mode !== 'enforce',
        mode,
        reason: mode === 'off' ? 'off' : 'native-proof-required',
      });
      expect(f.verifiers.turnstile).not.toHaveBeenCalled();
      if (mode === 'off')
        expect(f.store.hasNativeCapability).not.toHaveBeenCalled();
    }
  );
  it('requires both explicit fallback enablement and server-owned unsupported eligibility', async () => {
    for (const [enabled, unsupported] of [
      [false, true],
      [true, false],
      [false, false],
    ]) {
      const f = fixture('enforce', enabled, unsupported);
      const challenge = await f.issue();
      expect(
        (
          await f.service.verify({
            ...f.binding,
            mechanism: 'turnstile',
            proof: {
              challengeId: challenge.challengeId,
              token: 'token',
              keyId: 'untrusted-platform-claim',
            },
          })
        ).reason
      ).toBe(enabled ? 'fallback-ineligible' : 'fallback-disabled');
      expect(f.verifiers.turnstile).not.toHaveBeenCalled();
    }
  });
  it('does not advertise fallback without server eligibility and native capability checks', async () => {
    const f = fixture('enforce', true, true);
    f.keys.set('actor:key', {
      actorId: 'actor',
      publicKey: 'key',
      environment: 'production',
      platform: 'ios',
      counter: 0,
    });
    expect(await f.issue()).not.toHaveProperty('turnstileUrl');
    expect(f.store.hasNativeCapability).toHaveBeenCalledWith('actor');
  });
  it('allows native Play proof for an enrolled Apple actor but prevents a later Turnstile downgrade', async () => {
    const f = fixture('enforce', true, true);
    f.keys.set('actor:key', {
      actorId: 'actor',
      publicKey: 'key',
      environment: 'production',
      platform: 'ios',
      counter: 0,
    });
    const challenge = await f.issue();
    expect(
      (
        await f.service.verify({
          ...f.binding,
          mechanism: 'play-integrity',
          proof: { challengeId: challenge.challengeId, token: 'token' },
        })
      ).reason
    ).toBe('verified');
    expect(f.store.recordVerifiedPlayCapability).toHaveBeenCalledWith('actor');
    f.keys.clear();
    const fallback = await f.issue();
    expect(
      (
        await f.service.verify({
          ...f.binding,
          mechanism: 'turnstile',
          proof: { challengeId: fallback.challengeId, token: 'token' },
        })
      ).reason
    ).toBe('native-proof-required');
    expect(f.verifiers.turnstile).not.toHaveBeenCalled();
  });
  it('defaults to native proof when the server has no unsupported-platform policy', async () => {
    const f = fixture();
    const service = new NativeIntegrityService({
      mode: 'enforce',
      store: f.store,
      verifiers: f.verifiers,
      allowTurnstile: true,
    });
    const challenge = await service.issue({ ...f.binding, purpose: 'request' });
    if (challenge.mode === 'off') throw new Error('off');
    expect(
      (
        await service.verify({
          ...f.binding,
          mechanism: 'turnstile',
          proof: { challengeId: challenge.challengeId, token: 'token' },
        })
      ).reason
    ).toBe('fallback-ineligible');
    expect(f.verifiers.turnstile).not.toHaveBeenCalled();
  });
  it.each(['monitor', 'enforce'] as const)(
    '%s never treats unavailable eligibility policy as permission',
    async (mode) => {
      const f = fixture();
      const service = new NativeIntegrityService({
        mode,
        store: f.store,
        verifiers: f.verifiers,
        allowTurnstile: true,
        turnstileActorEligibility: async () => {
          throw new Error('private-policy-failure');
        },
      });
      const challenge = await service.issue({
        ...f.binding,
        purpose: 'request',
      });
      if (challenge.mode === 'off') throw new Error('off');
      expect(
        await service.verify({
          ...f.binding,
          mechanism: 'turnstile',
          proof: { challengeId: challenge.challengeId, token: 'token' },
        })
      ).toEqual({
        allowed: mode === 'monitor',
        mode,
        reason: 'provider-unavailable',
      });
      expect(f.verifiers.turnstile).not.toHaveBeenCalled();
    }
  );
  it('advertises fallback only for a server-eligible actor without native capability', async () => {
    const f = fixture('enforce', true, true);
    expect(await f.issue()).toMatchObject({
      turnstileUrl: 'https://tuturuuu.com/native-integrity/turnstile',
      turnstileSiteKey: 'public-site-key',
    });
    f.keys.set('other:key', {
      actorId: 'other',
      publicKey: 'key',
      environment: 'production',
      platform: 'ios',
      counter: 0,
    });
    const challenge = await f.issue();
    expect(
      (
        await f.service.verify({
          ...f.binding,
          mechanism: 'turnstile',
          proof: { challengeId: challenge.challengeId, token: 'token' },
        })
      ).reason
    ).toBe('verified');
  });
  it.each(['monitor', 'enforce'] as const)(
    '%s denies fallback if native capability appears during verification',
    async (mode) => {
      const f = fixture(mode, true, true);
      const challenge = await f.issue();
      f.verifiers.turnstile.mockImplementation(async () => {
        f.playActors.add('actor');
      });
      const result = await f.service.verify({
        ...f.binding,
        mechanism: 'turnstile',
        proof: { challengeId: challenge.challengeId, token: 'token' },
      });
      expect(result).toEqual({
        allowed: mode === 'monitor',
        mode,
        reason: 'native-proof-required',
      });
      expect(f.verifiers.turnstile).toHaveBeenCalledTimes(1);
    }
  );
  it.each(['monitor', 'enforce'] as const)(
    '%s does not grant Play verification before persisting native capability',
    async (mode) => {
      const f = fixture(mode);
      const challenge = await f.issue();
      vi.mocked(f.store.recordVerifiedPlayCapability).mockRejectedValue(
        new Error('private-store-failure')
      );
      expect(
        await f.service.verify({
          ...f.binding,
          mechanism: 'play-integrity',
          proof: { challengeId: challenge.challengeId, token: 'token' },
        })
      ).toEqual({
        allowed: mode === 'monitor',
        mode,
        reason: 'store-unavailable',
      });
    }
  );
  it.each(['monitor', 'enforce'] as const)(
    '%s handles capability-store failure without dispatching fallback',
    async (mode) => {
      const f = fixture(mode, true, true);
      const challenge = await f.issue();
      vi.mocked(f.store.hasNativeCapability).mockRejectedValue(
        new Error('private-store-failure')
      );
      const result = await f.service.verify({
        ...f.binding,
        mechanism: 'turnstile',
        proof: { challengeId: challenge.challengeId, token: 'token' },
      });
      expect(result).toEqual({
        allowed: mode === 'monitor',
        mode,
        reason: 'store-unavailable',
      });
      expect(f.verifiers.turnstile).not.toHaveBeenCalled();
    }
  );
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
