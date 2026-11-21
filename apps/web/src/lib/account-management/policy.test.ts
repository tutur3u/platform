import { describe, expect, it } from 'vitest';
import {
  type ChallengeBinding,
  canonicalBodyHash,
  consumeChallenge,
  issueChallenge,
  rejectUnavailableHumanDeletion,
  requireFreshFactor,
  requireTargetConfirmation,
} from './policy';

const actorId = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';
const binding: ChallengeBinding = {
  actorId,
  sessionId: '00000000-0000-4000-8000-000000000009',
  targetId,
  action: 'admin',
  bodyHash: canonicalBodyHash({ enabled: true }),
};

describe('account management security policy', () => {
  it('requires verified aal2 and a fresh nonfuture totp or webauthn factor', () => {
    for (const method of ['totp', 'webauthn']) {
      expect(() =>
        requireFreshFactor(
          { aal: 'aal2', amr: [{ method, timestamp: 700 }] },
          1000
        )
      ).not.toThrow();
    }
    for (const claims of [
      {},
      { aal: 'aal1', amr: [{ method: 'totp', timestamp: 1000 }] },
      { aal: 'aal2', amr: [{ method: 'password', timestamp: 1000 }] },
      { aal: 'aal2', amr: [{ method: 'totp', timestamp: 699 }] },
      { aal: 'aal2', amr: [{ method: 'totp', timestamp: 1001 }] },
    ])
      expect(() => requireFreshFactor(claims, 1000)).toThrow(
        'step_up_required'
      );
  });

  it('canonicalizes object order recursively but preserves array order', () => {
    expect(canonicalBodyHash({ z: [{ b: 2, a: 1 }], a: null })).toBe(
      canonicalBodyHash({ a: null, z: [{ a: 1, b: 2 }] })
    );
    expect(canonicalBodyHash([1, 2])).not.toBe(canonicalBodyHash([2, 1]));
    expect(() => canonicalBodyHash({ value: Infinity })).toThrow(
      'invalid_body'
    );
  });

  it('consumes the server challenge exactly once, including a mismatched attempt', async () => {
    const values = new Map<string, ChallengeBinding>();
    const store = {
      async putIfAbsent(key: string, value: ChallengeBinding, ttl: 120) {
        expect(ttl).toBe(120);
        if (values.has(key)) return false;
        values.set(key, value);
        return true;
      },
      async getdel(key: string) {
        const value = values.get(key);
        values.delete(key);
        return value;
      },
    };
    const { nonce } = await issueChallenge(store, binding);
    expect(nonce).toMatch(/^[a-f0-9]{32}$/u);
    const attempts = await Promise.allSettled([
      consumeChallenge(store, nonce, binding),
      consumeChallenge(store, nonce, binding),
    ]);
    expect(attempts.map(({ status }) => status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    for (const changed of [
      { ...binding, actorId: targetId },
      { ...binding, targetId: actorId },
      { ...binding, action: 'delete' } satisfies ChallengeBinding,
      { ...binding, bodyHash: canonicalBodyHash({ enabled: false }) },
    ]) {
      const challenge = await issueChallenge(store, binding);
      await expect(
        consumeChallenge(store, challenge.nonce, changed)
      ).rejects.toThrow('challenge_conflict');
      await expect(
        consumeChallenge(store, challenge.nonce, binding)
      ).rejects.toThrow('challenge_conflict');
    }
    await expect(consumeChallenge(store, 'bad', binding)).rejects.toThrow(
      'challenge_conflict'
    );
  });

  it('requires the exact UUID confirmation and keeps human deletion unavailable', () => {
    expect(() => requireTargetConfirmation(targetId, targetId)).not.toThrow();
    for (const confirmation of [undefined, 'yes', actorId]) {
      expect(() => requireTargetConfirmation(targetId, confirmation)).toThrow(
        'target_confirmation_required'
      );
    }
    expect(rejectUnavailableHumanDeletion).toThrow(
      'deletion_pipeline_not_available'
    );
  });
});
