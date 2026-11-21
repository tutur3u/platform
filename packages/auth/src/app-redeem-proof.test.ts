import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAppRedeemProof,
  requiresWorkerRedeemProof,
  verifyAppRedeemProof,
} from './app-redeem-proof';

describe('Worker-only redeem proof', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('applies to Mastermind only', () => {
    expect(requiresWorkerRedeemProof(' Mastermind ')).toBe(true);
    expect(requiresWorkerRedeemProof('calendar')).toBe(false);
  });

  it('binds the proof to target, credential and secret', () => {
    const proof = createAppRedeemProof('mastermind', 'cred', 'secret-a');
    const check = (
      overrides: Partial<Parameters<typeof verifyAppRedeemProof>[0]>,
      secret = 'secret-a'
    ) =>
      verifyAppRedeemProof(
        { targetApp: 'mastermind', credential: 'cred', proof, ...overrides },
        secret
      );
    expect(check({})).toBe(true);
    expect(check({ credential: 'other' })).toBe(false);
    expect(check({ targetApp: 'calendar' })).toBe(false);
    expect(check({ proof: null })).toBe(false);
    expect(check({ proof: `${proof}x` })).toBe(false);
    expect(check({}, 'secret-b')).toBe(false);
  });

  it('accepts the next coordination secret during rotation', () => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'current'.repeat(6));
    vi.stubEnv('APP_COORDINATION_TOKEN_NEXT_SECRET', 'next'.repeat(9));
    for (const secret of ['current'.repeat(6), 'next'.repeat(9)]) {
      expect(
        verifyAppRedeemProof({
          targetApp: 'mastermind',
          credential: 'cred',
          proof: createAppRedeemProof('mastermind', 'cred', secret),
        })
      ).toBe(true);
    }
  });
});
